import psycopg2
import sys

CONN_STRING = "postgresql://postgres.ksdcjwpbusadklpdwfsz:testnigheban@aws-1-ap-south-1.pooler.supabase.com:6543/postgres"

SQL = """
-- 1. Alter alert_rule
ALTER TABLE public.alert_rule 
ADD COLUMN IF NOT EXISTS is_rate_rule BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS rate_time_window_hours INTEGER;

-- 2. Create alert_candidate
CREATE TABLE IF NOT EXISTS public.alert_candidate (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID REFERENCES public.alert_rule(id),
    district_id UUID REFERENCES public.district(id),
    metric_name TEXT NOT NULL,
    observed_value NUMERIC NOT NULL,
    threshold_value NUMERIC NOT NULL,
    severity TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    geom geometry,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    external_id TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'dismissed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.alert_candidate ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read access" ON public.alert_candidate;
CREATE POLICY "Allow public read access" ON public.alert_candidate FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Allow service role full access" ON public.alert_candidate;
CREATE POLICY "Allow service role full access" ON public.alert_candidate TO service_role USING (true) WITH CHECK (true);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_alert_candidate_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_alert_candidate_updated_at ON public.alert_candidate;
CREATE TRIGGER trigger_alert_candidate_updated_at
BEFORE UPDATE ON public.alert_candidate
FOR EACH ROW EXECUTE FUNCTION update_alert_candidate_updated_at();


-- 3. Trigger to push approved candidates to hazard_event
CREATE OR REPLACE FUNCTION public.process_approved_candidate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NEW.status = 'approved' AND OLD.status = 'pending' THEN
        INSERT INTO public.hazard_event (
            hazard, source, severity, title, description, geom, district_ids, starts_at, ends_at, external_id
        ) VALUES (
            CASE WHEN NEW.metric_name IN ('precipitation', 'temperature') THEN 'weather'
                 WHEN NEW.metric_name IN ('water_level', 'discharge') THEN 'flood'
                 ELSE 'weather' END,
            'Alert Engine', NEW.severity, NEW.title, NEW.description, NEW.geom, 
            ARRAY[NEW.district_id], NEW.starts_at, NEW.ends_at, NEW.external_id
        )
        ON CONFLICT (external_id) DO UPDATE SET
            severity = EXCLUDED.severity, title = EXCLUDED.title, description = EXCLUDED.description;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_approve_candidate ON public.alert_candidate;
CREATE TRIGGER trigger_approve_candidate
AFTER UPDATE ON public.alert_candidate
FOR EACH ROW EXECUTE FUNCTION public.process_approved_candidate();


-- 4. Update evaluate_weather_reading
CREATE OR REPLACE FUNCTION public.evaluate_weather_reading()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    rule RECORD;
    val NUMERIC;
    prev_val NUMERIC;
    geom_val geometry;
BEGIN
    -- Evaluate precipitation
    IF NEW.precipitation IS NOT NULL THEN
        FOR rule IN SELECT * FROM public.alert_rule WHERE metric_name = 'precipitation' AND is_active = true AND (district_id IS NULL OR district_id = NEW.district_id) ORDER BY threshold_value DESC LOOP
            IF rule.is_rate_rule THEN
                SELECT precipitation INTO prev_val FROM public.weather_reading 
                WHERE district_id = NEW.district_id AND fetched_at >= NEW.fetched_at - (rule.rate_time_window_hours || ' hours')::interval AND fetched_at < NEW.fetched_at
                ORDER BY fetched_at ASC LIMIT 1;
                IF prev_val IS NOT NULL THEN val := NEW.precipitation - prev_val; ELSE val := NULL; END IF;
            ELSE
                val := NEW.precipitation;
            END IF;
            
            IF val IS NOT NULL AND (
               (rule.operator = '>' AND val > rule.threshold_value) OR
               (rule.operator = '>=' AND val >= rule.threshold_value) OR
               (rule.operator = '<' AND val < rule.threshold_value) OR
               (rule.operator = '<=' AND val <= rule.threshold_value)
            ) THEN
                SELECT geom INTO geom_val FROM public.district WHERE id = NEW.district_id LIMIT 1;
                INSERT INTO public.alert_candidate (
                    rule_id, district_id, metric_name, observed_value, threshold_value, severity, title, description, geom, starts_at, ends_at, external_id
                ) VALUES (
                    rule.id, NEW.district_id, 'precipitation', val, rule.threshold_value, rule.severity,
                    REPLACE(REPLACE(rule.title_template, '{value}', val::text), '{threshold}', rule.threshold_value::text),
                    REPLACE(REPLACE(rule.description_template, '{value}', val::text), '{threshold}', rule.threshold_value::text),
                    geom_val, NEW.fetched_at, NEW.fetched_at + INTERVAL '24 hours', 'weather_precip_' || NEW.id::text
                )
                ON CONFLICT (external_id) DO UPDATE SET
                    severity = EXCLUDED.severity, title = EXCLUDED.title, description = EXCLUDED.description, 
                    observed_value = EXCLUDED.observed_value, status = 'pending';
                EXIT;
            END IF;
        END LOOP;
    END IF;

    -- Evaluate temperature
    IF NEW.temperature IS NOT NULL THEN
        FOR rule IN SELECT * FROM public.alert_rule WHERE metric_name = 'temperature' AND is_active = true AND (district_id IS NULL OR district_id = NEW.district_id) ORDER BY threshold_value DESC LOOP
            IF rule.is_rate_rule THEN
                SELECT temperature INTO prev_val FROM public.weather_reading 
                WHERE district_id = NEW.district_id AND fetched_at >= NEW.fetched_at - (rule.rate_time_window_hours || ' hours')::interval AND fetched_at < NEW.fetched_at
                ORDER BY fetched_at ASC LIMIT 1;
                IF prev_val IS NOT NULL THEN val := NEW.temperature - prev_val; ELSE val := NULL; END IF;
            ELSE
                val := NEW.temperature;
            END IF;
            
            IF val IS NOT NULL AND (
               (rule.operator = '>' AND val > rule.threshold_value) OR
               (rule.operator = '>=' AND val >= rule.threshold_value) OR
               (rule.operator = '<' AND val < rule.threshold_value) OR
               (rule.operator = '<=' AND val <= rule.threshold_value)
            ) THEN
                SELECT geom INTO geom_val FROM public.district WHERE id = NEW.district_id LIMIT 1;
                INSERT INTO public.alert_candidate (
                    rule_id, district_id, metric_name, observed_value, threshold_value, severity, title, description, geom, starts_at, ends_at, external_id
                ) VALUES (
                    rule.id, NEW.district_id, 'temperature', val, rule.threshold_value, rule.severity,
                    REPLACE(REPLACE(rule.title_template, '{value}', val::text), '{threshold}', rule.threshold_value::text),
                    REPLACE(REPLACE(rule.description_template, '{value}', val::text), '{threshold}', rule.threshold_value::text),
                    geom_val, NEW.fetched_at, NEW.fetched_at + INTERVAL '24 hours', 'weather_temp_' || NEW.id::text
                )
                ON CONFLICT (external_id) DO UPDATE SET
                    severity = EXCLUDED.severity, title = EXCLUDED.title, description = EXCLUDED.description, 
                    observed_value = EXCLUDED.observed_value, status = 'pending';
                EXIT;
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$;


-- 5. Update evaluate_manual_reading
CREATE OR REPLACE FUNCTION public.evaluate_manual_reading()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    rule RECORD;
    val NUMERIC;
    prev_val NUMERIC;
    geom_val geometry;
BEGIN
    IF NEW.value IS NOT NULL AND NEW.reading_type IN ('water_level', 'discharge') THEN
        FOR rule IN SELECT * FROM public.alert_rule WHERE metric_name = 'water_level' AND is_active = true AND (district_id IS NULL OR district_id = NEW.district_id) ORDER BY threshold_value DESC LOOP
            IF rule.is_rate_rule THEN
                SELECT value INTO prev_val FROM public.manual_reading 
                WHERE station_name = NEW.station_name AND reading_type = NEW.reading_type
                  AND entered_at >= NEW.entered_at - (rule.rate_time_window_hours || ' hours')::interval AND entered_at < NEW.entered_at
                ORDER BY entered_at ASC LIMIT 1;
                IF prev_val IS NOT NULL THEN val := NEW.value - prev_val; ELSE val := NULL; END IF;
            ELSE
                val := NEW.value;
            END IF;
            
            IF val IS NOT NULL AND (
               (rule.operator = '>' AND val > rule.threshold_value) OR
               (rule.operator = '>=' AND val >= rule.threshold_value) OR
               (rule.operator = '<' AND val < rule.threshold_value) OR
               (rule.operator = '<=' AND val <= rule.threshold_value)
            ) THEN
                SELECT geom INTO geom_val FROM public.district WHERE id = NEW.district_id LIMIT 1;
                INSERT INTO public.alert_candidate (
                    rule_id, district_id, metric_name, observed_value, threshold_value, severity, title, description, geom, starts_at, ends_at, external_id
                ) VALUES (
                    rule.id, NEW.district_id, 'water_level', val, rule.threshold_value, rule.severity,
                    REPLACE(REPLACE(rule.title_template, '{value}', val::text), '{threshold}', rule.threshold_value::text),
                    REPLACE(REPLACE(rule.description_template, '{value}', val::text), '{threshold}', rule.threshold_value::text),
                    geom_val, NEW.entered_at, NEW.entered_at + INTERVAL '24 hours', 'manual_water_' || NEW.id::text
                )
                ON CONFLICT (external_id) DO UPDATE SET
                    severity = EXCLUDED.severity, title = EXCLUDED.title, description = EXCLUDED.description, 
                    observed_value = EXCLUDED.observed_value, status = 'pending';
                EXIT;
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$;

-- 6. Seed Rate Rules
INSERT INTO public.alert_rule (metric_name, operator, threshold_value, severity, title_template, description_template, is_rate_rule, rate_time_window_hours) VALUES
('water_level', '>', 1.5, 'warning', 'Rapid River Increase', 'Water level rose by {value}m in 24 hours, exceeding the 1.5m rate threshold.', true, 24),
('water_level', '>', 0.5, 'emergency', 'Rapid Lake Rise (GLOF Precursor)', 'Lake level rose by {value}m in 12 hours, exceeding the 0.5m rate threshold.', true, 12);

"""

def main():
    try:
        conn = psycopg2.connect(CONN_STRING)
        cur = conn.cursor()
        cur.execute(SQL)
        conn.commit()
        print("Candidates migration and triggers updated successfully.")
    except Exception as e:
        print(f"Update failed: {e}")
        sys.exit(1)
    finally:
        if 'conn' in locals() and conn:
            conn.close()

if __name__ == "__main__":
    main()
