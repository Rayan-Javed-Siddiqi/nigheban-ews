-- M4: Alert Engine + CAP Composer enhancements

-- Minute-granularity rate windows (GLOF: 0.5m rise in 15 min)
ALTER TABLE public.alert_rule
  ADD COLUMN IF NOT EXISTS rate_time_window_minutes integer;

-- Drop legacy duplicate manual_reading evaluator (keeps alert_rules + rate triggers)
DROP TRIGGER IF EXISTS trigger_evaluate_manual_reading ON public.manual_reading;

-- Prefill CAP fields when a rule fires
CREATE OR REPLACE FUNCTION public.prefill_alert_candidate_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.event_en IS NOT NULL AND NEW.event_en <> '' THEN
    RETURN NEW;
  END IF;

  NEW.headline_en := COALESCE(NULLIF(NEW.headline_en, ''), NEW.title);
  NEW.headline_ur := COALESCE(NULLIF(NEW.headline_ur, ''), NEW.title);

  CASE NEW.metric_name
    WHEN 'water_level' THEN
      NEW.event_en := 'Glacial Lake Outburst Flood Warning';
      NEW.event_ur := 'گلیشئل جھیل پھٹنے کی وارننگ';
      NEW.urgency := 'immediate';
      NEW.certainty := 'observed';
      NEW.instructions_en := 'Evacuate low-lying areas and riverbanks immediately. Do not cross streams. Monitor upstream lake levels and follow PDMA instructions.';
      NEW.instructions_ur := 'فوری طور پر نچلے علاقوں اور دریا کے کناروں کو خالی کریں۔ ندی نالوں کو نہ پار کریں۔';
    WHEN 'discharge' THEN
      NEW.event_en := 'River Flood Warning';
      NEW.event_ur := 'دریائی سیلاب کی وارننگ';
      NEW.urgency := 'immediate';
      NEW.certainty := 'likely';
      NEW.instructions_en := 'Move livestock and valuables to higher ground. Avoid travel through flood-prone routes.';
      NEW.instructions_ur := 'مویشی اور قیمتی سامان بلند مقامات پر منتقل کریں۔';
    WHEN 'precipitation' THEN
      NEW.event_en := 'Heavy Rainfall Warning';
      NEW.event_ur := 'شدید بارش کی وارننگ';
      NEW.urgency := 'expected';
      NEW.certainty := 'likely';
      NEW.instructions_en := 'Expect flash flooding in catchments. Clear drainage channels where safe. Stay away from steep slopes.';
      NEW.instructions_ur := 'گھاٹیوں میں فلیش سیلاب کا امکان۔ نکاسی کی نالیوں کو صاف رکھیں۔';
    WHEN 'temperature' THEN
      NEW.event_en := 'Extreme Heat Warning';
      NEW.event_ur := 'شدید گرمی کی وارننگ';
      NEW.urgency := 'expected';
      NEW.certainty := 'observed';
      NEW.instructions_en := 'Avoid outdoor work during peak heat. Stay hydrated. Check on vulnerable residents.';
      NEW.instructions_ur := 'گرمی کی شدید لہر میں باہر کا کام کم کریں۔ پانی پیتے رہیں۔';
    WHEN 'rainfall' THEN
      NEW.event_en := 'Heavy Rainfall Warning';
      NEW.event_ur := 'شدید بارش کی وارننگ';
      NEW.urgency := 'expected';
      NEW.certainty := 'likely';
      NEW.instructions_en := 'Monitor local streams and landslide-prone slopes.';
      NEW.instructions_ur := 'مقامی ندی نالوں اور landslide والے slopes پر نظر رکھیں۔';
    ELSE
      NEW.event_en := COALESCE(NEW.event_en, NEW.title);
      NEW.event_ur := COALESCE(NEW.event_ur, NEW.title);
      NEW.urgency := COALESCE(NEW.urgency, 'expected');
      NEW.certainty := COALESCE(NEW.certainty, 'likely');
  END CASE;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_prefill_alert_candidate_cap ON public.alert_candidate;
CREATE TRIGGER trigger_prefill_alert_candidate_cap
  BEFORE INSERT ON public.alert_candidate
  FOR EACH ROW EXECUTE FUNCTION public.prefill_alert_candidate_cap();

-- Helper: rate lookback interval from rule
CREATE OR REPLACE FUNCTION public.alert_rule_lookback(r public.alert_rule)
RETURNS interval
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    CASE WHEN r.rate_time_window_minutes IS NOT NULL AND r.rate_time_window_minutes > 0
      THEN (r.rate_time_window_minutes || ' minutes')::interval END,
    CASE WHEN r.rate_time_window_hours IS NOT NULL AND r.rate_time_window_hours > 0
      THEN (r.rate_time_window_hours || ' hours')::interval END,
    interval '1 hour'
  );
$$;

-- Station rate rules: support minute windows
CREATE OR REPLACE FUNCTION public.evaluate_station_reading_rate_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
declare
  r record;
  v_district_id uuid;
  v_current_value double precision;
  v_past_value double precision;
  v_delta double precision;
  v_geom geometry;
  v_title text;
  v_description text;
  v_window interval;
begin
  select district_id into v_district_id from station where id = NEW.station_id;

  for r in
    select * from alert_rule
    where is_active = true
      and is_rate_rule = true
      and (district_id is null or district_id = v_district_id)
  loop
    v_current_value := case r.metric_name
      when 'temperature' then NEW.temperature
      when 'water_level' then NEW.water_level
      when 'precipitation' then NEW.rainfall
      else null
    end;

    if v_current_value is null then continue; end if;

    v_window := public.alert_rule_lookback(r);

    select case r.metric_name
      when 'temperature' then temperature
      when 'water_level' then water_level
      when 'precipitation' then rainfall
    end
    into v_past_value
    from station_reading
    where station_id = NEW.station_id
      and recorded_at <= NEW.recorded_at - v_window
    order by recorded_at desc
    limit 1;

    if v_past_value is null then continue; end if;

    v_delta := v_current_value - v_past_value;

    if (r.operator = '>' and v_delta > r.threshold_value)
       or (r.operator = '>=' and v_delta >= r.threshold_value)
    then
      select geom into v_geom from district where id = v_district_id;
      v_title := r.title_template;
      v_description := replace(r.description_template, '{value}', round(v_delta::numeric,2)::text);

      insert into alert_candidate (
        rule_id, district_id, metric_name, observed_value, threshold_value,
        severity, title, description, geom, starts_at, ends_at, external_id, status
      )
      values (
        r.id, v_district_id, r.metric_name, v_current_value, r.threshold_value,
        r.severity, v_title, v_description, v_geom,
        now(), now() + interval '24 hours',
        'station_rate_' || r.id::text || '_' || NEW.id::text,
        'pending'
      )
      on conflict (external_id) do nothing;
    end if;
  end loop;

  return NEW;
end;
$$;

-- Manual reading rate rules: minute windows
CREATE OR REPLACE FUNCTION public.evaluate_manual_reading_rate_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
declare
  r record;
  v_past_value numeric;
  v_delta numeric;
  v_geom geometry;
  v_title text;
  v_description text;
  v_window interval;
begin
  for r in
    select * from alert_rule
    where is_active = true
      and is_rate_rule = true
      and metric_name = NEW.reading_type
      and (district_id is null or district_id = NEW.district_id)
  loop
    v_window := public.alert_rule_lookback(r);

    select value into v_past_value
    from manual_reading
    where district_id = NEW.district_id
      and reading_type = NEW.reading_type
      and entered_at <= NEW.entered_at - v_window
    order by entered_at desc
    limit 1;

    if v_past_value is null then continue; end if;

    v_delta := NEW.value - v_past_value;

    if (r.operator = '>' and v_delta > r.threshold_value)
       or (r.operator = '>=' and v_delta >= r.threshold_value)
    then
      select geom into v_geom from district where id = NEW.district_id;
      v_title := r.title_template;
      v_description := replace(r.description_template, '{value}', round(v_delta,2)::text);

      insert into alert_candidate (
        rule_id, district_id, metric_name, observed_value, threshold_value,
        severity, title, description, geom, starts_at, ends_at, external_id, status
      )
      values (
        r.id, NEW.district_id, r.metric_name, NEW.value, r.threshold_value,
        r.severity, v_title, v_description, v_geom,
        now(), now() + interval '24 hours',
        'manual_rate_' || r.id::text || '_' || NEW.id::text,
        'pending'
      )
      on conflict (external_id) do nothing;
    end if;
  end loop;

  return NEW;
end;
$$;

-- Issued alerts promote to hazard_event (M4 issued path, not legacy approved shortcut)
CREATE OR REPLACE FUNCTION public.process_approved_candidate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF (NEW.status = 'issued' AND OLD.status = 'pending_approval')
     OR (NEW.status = 'approved' AND OLD.status = 'pending')
  THEN
    INSERT INTO public.hazard_event (
      hazard, source, severity, title, description, geom, district_ids, starts_at, ends_at, external_id
    ) VALUES (
      CASE
        WHEN NEW.metric_name IN ('precipitation', 'rainfall', 'temperature') THEN 'weather'
        WHEN NEW.metric_name IN ('water_level', 'discharge') THEN 'flood'
        ELSE 'weather'
      END,
      'Alert Engine',
      NEW.severity,
      COALESCE(NEW.headline_en, NEW.title),
      COALESCE(NEW.description, ''),
      NEW.geom,
      CASE WHEN NEW.district_id IS NOT NULL THEN ARRAY[NEW.district_id] ELSE NULL END,
      NEW.starts_at,
      NEW.ends_at,
      'alert_' || NEW.id::text
    )
    ON CONFLICT (external_id) DO UPDATE SET
      severity = EXCLUDED.severity,
      title = EXCLUDED.title,
      description = EXCLUDED.description;
  END IF;

  IF NEW.status = 'cancelled' AND OLD.status = 'issued' THEN
    UPDATE public.hazard_event
    SET ends_at = now()
    WHERE external_id = 'alert_' || NEW.id::text;
  END IF;

  RETURN NEW;
END;
$$;

-- GLOF rate rule: 0.5 m water-level rise in 15 minutes (build guide M4)
INSERT INTO public.alert_rule (
  metric_name, operator, threshold_value, severity,
  title_template, description_template,
  is_active, is_rate_rule, rate_time_window_minutes
)
SELECT
  'water_level', '>=', 0.5, 'emergency',
  'GLOF Surge Detected',
  'Water level rose {value} m within 15 minutes — possible glacial lake outburst surge.',
  true, true, 15
WHERE NOT EXISTS (
  SELECT 1 FROM public.alert_rule
  WHERE metric_name = 'water_level'
    AND is_rate_rule = true
    AND rate_time_window_minutes = 15
    AND threshold_value = 0.5
);

NOTIFY pgrst, 'reload schema';
