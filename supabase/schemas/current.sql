


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."app_role" AS ENUM (
    'dg',
    'duty_officer',
    'district_focal',
    'viewer'
);


ALTER TYPE "public"."app_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."evaluate_manual_reading"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."evaluate_manual_reading"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."evaluate_manual_reading_alert_rules"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  r record;
  v_geom geometry;
  v_title text;
  v_description text;
  v_matches boolean;
begin
  for r in
    select * from alert_rule
    where is_active = true
      and is_rate_rule = false
      and metric_name = NEW.reading_type
      and (district_id is null or district_id = NEW.district_id)
  loop
    v_matches := case r.operator
      when '>' then NEW.value > r.threshold_value
      when '>=' then NEW.value >= r.threshold_value
      when '<' then NEW.value < r.threshold_value
      when '<=' then NEW.value <= r.threshold_value
      when '=' then NEW.value = r.threshold_value
      else false
    end;

    if v_matches then
      select geom into v_geom from district where id = NEW.district_id;

      v_title := r.title_template;
      v_description := replace(r.description_template, '{value}', NEW.value::text);

      insert into alert_candidate (
        rule_id, district_id, metric_name, observed_value, threshold_value,
        severity, title, description, geom, starts_at, ends_at, external_id, status
      )
      values (
        r.id, NEW.district_id, r.metric_name, NEW.value, r.threshold_value,
        r.severity, v_title, v_description, v_geom,
        now(), now() + interval '24 hours',
        'manual_' || r.metric_name || '_' || NEW.id::text,
        'pending'
      );
    end if;
  end loop;

  return NEW;
end;
$$;


ALTER FUNCTION "public"."evaluate_manual_reading_alert_rules"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."evaluate_manual_reading_rate_rules"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  r record;
  v_past_value numeric;
  v_delta numeric;
  v_geom geometry;
  v_title text;
  v_description text;
begin
  for r in
    select * from alert_rule
    where is_active = true
      and is_rate_rule = true
      and metric_name = NEW.reading_type
      and (district_id is null or district_id = NEW.district_id)
  loop
    select value into v_past_value
    from manual_reading
    where district_id = NEW.district_id
      and reading_type = NEW.reading_type
      and entered_at <= NEW.entered_at - (r.rate_time_window_hours || ' hours')::interval
    order by entered_at desc
    limit 1;

    if v_past_value is null then
      continue;
    end if;

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


ALTER FUNCTION "public"."evaluate_manual_reading_rate_rules"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."evaluate_station_reading_alert_rules"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  r record;
  v_district_id uuid;
  v_geom geometry;
  v_param_value double precision;
  v_title text;
  v_description text;
  v_matches boolean;
begin
  select district_id into v_district_id from station where id = NEW.station_id;

  for r in
    select * from alert_rule
    where is_active = true
      and is_rate_rule = false
      and (district_id is null or district_id = v_district_id)
  loop
    v_param_value := case r.metric_name
      when 'temperature' then NEW.temperature
      when 'water_level' then NEW.water_level
      when 'precipitation' then NEW.rainfall
      else null
    end;

    if v_param_value is null then
      continue;
    end if;

    v_matches := case r.operator
      when '>' then v_param_value > r.threshold_value
      when '>=' then v_param_value >= r.threshold_value
      when '<' then v_param_value < r.threshold_value
      when '<=' then v_param_value <= r.threshold_value
      when '=' then v_param_value = r.threshold_value
      else false
    end;

    if v_matches then
      select geom into v_geom from district where id = v_district_id;

      v_title := r.title_template;
      v_description := replace(r.description_template, '{value}', v_param_value::text);

      insert into alert_candidate (
        rule_id, district_id, metric_name, observed_value, threshold_value,
        severity, title, description, geom, starts_at, ends_at, external_id, status
      )
      values (
        r.id, v_district_id, r.metric_name, v_param_value, r.threshold_value,
        r.severity, v_title, v_description, v_geom,
        now(), now() + interval '24 hours',
        'station_' || r.id::text || '_' || NEW.id::text,
        'pending'
      )
      on conflict (external_id) do nothing;
    end if;
  end loop;

  return NEW;
end;
$$;


ALTER FUNCTION "public"."evaluate_station_reading_alert_rules"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."evaluate_station_reading_rate_rules"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
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

    if v_current_value is null then
      continue;
    end if;

    select case r.metric_name
      when 'temperature' then temperature
      when 'water_level' then water_level
      when 'precipitation' then rainfall
    end
    into v_past_value
    from station_reading
    where station_id = NEW.station_id
      and recorded_at <= NEW.recorded_at - (r.rate_time_window_hours || ' hours')::interval
    order by recorded_at desc
    limit 1;

    if v_past_value is null then
      continue;
    end if;

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


ALTER FUNCTION "public"."evaluate_station_reading_rate_rules"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."evaluate_temperature_threshold"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_district_id uuid;
begin
  -- Adjust column names below once you confirm your observation/manual_reading table shape
  if NEW.reading_type = 'temperature' and NEW.value >= 45 then
    insert into alert (hazard, severity, status, district_ids, cap, source_rule)
    values (
      'extreme_heat',
      'severe',
      'candidate',
      array[NEW.district_id],
      jsonb_build_object(
        'event_en', 'Extreme Temperature Warning',
        'event_ur', '',
        'headline_en', format('Temperature of %s°C recorded', NEW.value),
        'headline_ur', ''
      ),
      null
    );
  end if;
  return NEW;
end;
$$;


ALTER FUNCTION "public"."evaluate_temperature_threshold"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."evaluate_weather_reading"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."evaluate_weather_reading"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_district_hazards"("p_district_id" "uuid", "p_limit" integer DEFAULT 20) RETURNS TABLE("id" "uuid", "hazard" "text", "severity" "text", "title" "text", "starts_at" timestamp with time zone, "source" "text")
    LANGUAGE "sql" STABLE
    AS $$
  select he.id, he.hazard, he.severity, he.title, he.starts_at, he.source
  from hazard_event he, district d
  where d.id = p_district_id
    and he.geom is not null
    and ST_DWithin(he.geom::geography, d.geom::geography, 50000)
  order by he.starts_at desc nulls last
  limit p_limit;
$$;


ALTER FUNCTION "public"."get_district_hazards"("p_district_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_district_lonlat"("district_id" "uuid") RETURNS TABLE("lon" double precision, "lat" double precision)
    LANGUAGE "sql" STABLE
    AS $$
  select ST_X(centroid), ST_Y(centroid) from district where id = district_id;
$$;


ALTER FUNCTION "public"."get_district_lonlat"("district_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_district_mask_geojson"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    result jsonb;
BEGIN
    SELECT ST_AsGeoJSON(
        ST_Difference(
            ST_MakeEnvelope(-180, -90, 180, 90, 4326),
            ST_Union(geom)
        )
    )::jsonb INTO result
    FROM public.district;
    
    RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_district_mask_geojson"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_districts_geojson"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    AS $$
  select jsonb_build_object(
    'type', 'FeatureCollection',
    'features', jsonb_agg(
      jsonb_build_object(
        'type', 'Feature',
        'geometry', ST_AsGeoJSON(geom)::jsonb,
        'properties', jsonb_build_object(
          'id', id,
          'name_en', name_en,
          'province', province,
          'adm2_code', adm2_code
        )
      )
    )
  )
  from district;
$$;


ALTER FUNCTION "public"."get_districts_geojson"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_drought_geojson"() RETURNS json
    LANGUAGE "sql" STABLE
    AS $$
  SELECT json_build_object(
    'type', 'FeatureCollection',
    'features', COALESCE(json_agg(
      json_build_object(
        'type', 'Feature',
        'geometry', ST_AsGeoJSON(d.geom)::json,
        'properties', json_build_object(
          'district_id', d.id,
          'name_en', d.name_en,
          'province', d.province,
          'spi_3', di.spi_3,
          'date', di.date
        )
      )
    ), '[]'::json)
  )
  FROM public.district d
  INNER JOIN LATERAL (
    SELECT spi_3, date
    FROM public.drought_index
    WHERE district_id = d.id
    ORDER BY date DESC
    LIMIT 1
  ) di ON true;
$$;


ALTER FUNCTION "public"."get_drought_geojson"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_glacial_lakes_geojson"() RETURNS json
    LANGUAGE "sql" STABLE
    AS $$
  SELECT json_build_object(
    'type', 'FeatureCollection',
    'features', COALESCE(json_agg(
      json_build_object(
        'type', 'Feature',
        'geometry', ST_AsGeoJSON(gl.geom)::json,
        'properties', json_build_object(
          'id', gl.id,
          'name', gl.name,
          'valley', gl.valley,
          'hazard_class', gl.hazard_class,
          'downstream_population', gl.downstream_population,
          'source', gl.source
        )
      )
    ), '[]'::json)
  )
  FROM public.glacial_lake gl;
$$;


ALTER FUNCTION "public"."get_glacial_lakes_geojson"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_hazard_events_geojson"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    AS $$
  select jsonb_build_object(
    'type', 'FeatureCollection',
    'features', jsonb_agg(
      jsonb_build_object(
        'type', 'Feature',
        'geometry', ST_AsGeoJSON(geom)::jsonb,
        'properties', jsonb_build_object(
          'id', id,
          'hazard', hazard,
          'severity', severity,
          'title', title,
          'starts_at', starts_at
        )
      )
    )
  )
  from hazard_event
  where geom is not null;
$$;


ALTER FUNCTION "public"."get_hazard_events_geojson"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_alert_candidate_created"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into audit_log (at, actor, actor_role, action, entity, entity_id, detail)
  values (
    now(),
    null,
    null,
    'rule_fired',
    'alert_candidate',
    NEW.id::text,
    jsonb_build_object(
      'rule_id', NEW.rule_id,
      'metric_name', NEW.metric_name,
      'observed_value', NEW.observed_value,
      'threshold_value', NEW.threshold_value,
      'severity', NEW.severity,
      'external_id', NEW.external_id
    )
  );
  return NEW;
end;
$$;


ALTER FUNCTION "public"."log_alert_candidate_created"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_alert_candidate_status_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  if TG_OP = 'UPDATE' and OLD.status is distinct from NEW.status then
    insert into audit_log (at, actor, actor_role, action, entity, entity_id, detail)
    values (
      now(),
      auth.uid(),
      (select role::text from profile where id = auth.uid()),
      'status_change',
      'alert_candidate',
      NEW.id::text,
      jsonb_build_object('from', OLD.status, 'to', NEW.status)
    );
  end if;
  return NEW;
end;
$$;


ALTER FUNCTION "public"."log_alert_candidate_status_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_alert_rule_edit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  if TG_OP = 'UPDATE' and (
    OLD.threshold_value is distinct from NEW.threshold_value
    or OLD.operator is distinct from NEW.operator
    or OLD.severity is distinct from NEW.severity
    or OLD.is_active is distinct from NEW.is_active
    or OLD.rate_time_window_hours is distinct from NEW.rate_time_window_hours
  ) then
    insert into audit_log (at, actor, actor_role, action, entity, entity_id, detail)
    values (
      now(),
      auth.uid(),
      (select role::text from profile where id = auth.uid()),
      'threshold_edit',
      'alert_rule',
      NEW.id::text,
      jsonb_build_object(
        'old_threshold', OLD.threshold_value, 'new_threshold', NEW.threshold_value,
        'old_operator', OLD.operator, 'new_operator', NEW.operator,
        'old_severity', OLD.severity, 'new_severity', NEW.severity,
        'old_is_active', OLD.is_active, 'new_is_active', NEW.is_active
      )
    );
  end if;
  return NEW;
end;
$$;


ALTER FUNCTION "public"."log_alert_rule_edit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_alert_status_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  if TG_OP = 'UPDATE' and OLD.status is distinct from NEW.status then
    insert into audit_log (at, actor, actor_role, action, entity, entity_id, detail)
    values (
      now(),
      auth.uid(),
      (select role::text from profile where id = auth.uid()),
      'status_change',
      'alert',
      NEW.id::text,
      jsonb_build_object('from', OLD.status, 'to', NEW.status)
    );
  elsif TG_OP = 'INSERT' then
    insert into audit_log (at, actor, actor_role, action, entity, entity_id, detail)
    values (
      now(),
      auth.uid(),
      (select role::text from profile where id = auth.uid()),
      'candidate_created',
      'alert',
      NEW.id::text,
      jsonb_build_object('hazard', NEW.hazard, 'source_event', NEW.source_event)
    );
  end if;
  return NEW;
end;
$$;


ALTER FUNCTION "public"."log_alert_status_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_audit_log_modification"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
        BEGIN
            RAISE EXCEPTION 'audit_log is an append-only table. UPDATE and DELETE are strictly prohibited.';
            RETURN NULL;
        END;
        $$;


ALTER FUNCTION "public"."prevent_audit_log_modification"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_approved_candidate"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."process_approved_candidate"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_alert_candidate_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_alert_candidate_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."advisory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "district_id" "uuid",
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "source" "text" NOT NULL,
    "is_demo_data" boolean DEFAULT true NOT NULL,
    "issued_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."advisory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."alert" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cap" "jsonb" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "hazard" "text" NOT NULL,
    "severity" "text" NOT NULL,
    "district_ids" "uuid"[] NOT NULL,
    "created_by" "uuid",
    "approved_by" "uuid",
    "issued_at" timestamp with time zone,
    "source_event" "uuid",
    "source_rule" "uuid",
    CONSTRAINT "alert_status_check" CHECK (("status" = ANY (ARRAY['candidate'::"text", 'draft'::"text", 'pending_approval'::"text", 'issued'::"text", 'cancelled'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."alert" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."alert_candidate" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rule_id" "uuid",
    "district_id" "uuid",
    "metric_name" "text" NOT NULL,
    "observed_value" numeric NOT NULL,
    "threshold_value" numeric NOT NULL,
    "severity" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "geom" "public"."geometry",
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone NOT NULL,
    "external_id" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "urgency" "text",
    "certainty" "text",
    "event_en" "text",
    "event_ur" "text",
    "headline_en" "text",
    "headline_ur" "text",
    "instructions_en" "text",
    "instructions_ur" "text",
    "issued_by" "uuid",
    "issued_at" timestamp with time zone,
    CONSTRAINT "alert_candidate_certainty_check" CHECK (("certainty" = ANY (ARRAY['observed'::"text", 'likely'::"text", 'possible'::"text", 'unlikely'::"text"]))),
    CONSTRAINT "alert_candidate_severity_check" CHECK (("severity" = ANY (ARRAY['emergency'::"text", 'warning'::"text", 'watch'::"text", 'advisory'::"text"]))),
    CONSTRAINT "alert_candidate_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'draft'::"text", 'pending_approval'::"text", 'issued'::"text", 'approved'::"text", 'dismissed'::"text", 'cancelled'::"text", 'expired'::"text"]))),
    CONSTRAINT "alert_candidate_urgency_check" CHECK (("urgency" = ANY (ARRAY['immediate'::"text", 'expected'::"text", 'future'::"text", 'past'::"text"])))
);


ALTER TABLE "public"."alert_candidate" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."alert_delivery" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "alert_id" "uuid" NOT NULL,
    "channel" "text" NOT NULL,
    "recipient" "text" NOT NULL,
    "district_id" "uuid",
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "status_at" timestamp with time zone DEFAULT "now"(),
    "ack_by" "text",
    "ack_at" timestamp with time zone,
    CONSTRAINT "alert_delivery_channel_check" CHECK (("channel" = ANY (ARRAY['sms'::"text", 'whatsapp'::"text", 'siren'::"text", 'loudspeaker'::"text", 'email'::"text", 'app_push'::"text"]))),
    CONSTRAINT "alert_delivery_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'sent'::"text", 'delivered'::"text", 'failed'::"text", 'acknowledged'::"text", 'dry_run'::"text"])))
);


ALTER TABLE "public"."alert_delivery" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."alert_rule" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "metric_name" "text" NOT NULL,
    "district_id" "uuid",
    "operator" "text" NOT NULL,
    "threshold_value" numeric NOT NULL,
    "severity" "text" NOT NULL,
    "title_template" "text" NOT NULL,
    "description_template" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_rate_rule" boolean DEFAULT false NOT NULL,
    "rate_time_window_hours" integer,
    CONSTRAINT "alert_rule_operator_check" CHECK (("operator" = ANY (ARRAY['>'::"text", '>='::"text", '<'::"text", '<='::"text", '='::"text"]))),
    CONSTRAINT "alert_rule_severity_check" CHECK (("severity" = ANY (ARRAY['watch'::"text", 'warning'::"text", 'emergency'::"text"])))
);


ALTER TABLE "public"."alert_rule" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" bigint NOT NULL,
    "at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "actor" "uuid",
    "actor_role" "text",
    "action" "text" NOT NULL,
    "entity" "text",
    "entity_id" "text",
    "detail" "jsonb"
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


ALTER TABLE "public"."audit_log" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."audit_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."channel_recipient_count" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "district_id" "uuid" NOT NULL,
    "channel" "text" NOT NULL,
    "recipient_count" integer NOT NULL,
    "is_demo_data" boolean DEFAULT true NOT NULL,
    CONSTRAINT "channel_recipient_count_channel_check" CHECK (("channel" = ANY (ARRAY['sms'::"text", 'whatsapp'::"text", 'email'::"text", 'app_push'::"text", 'siren'::"text", 'loudspeaker'::"text"])))
);


ALTER TABLE "public"."channel_recipient_count" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."district" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "adm2_code" "text" NOT NULL,
    "name_en" "text" NOT NULL,
    "name_ur" "text",
    "province" "text" NOT NULL,
    "geom" "public"."geometry"(MultiPolygon,4326) NOT NULL,
    "population" integer,
    "centroid" "public"."geometry"(Point,4326),
    CONSTRAINT "district_province_check" CHECK (("province" = ANY (ARRAY['KP'::"text", 'GB'::"text"])))
);


ALTER TABLE "public"."district" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."district_centroid_latlon" AS
 SELECT "id" AS "district_id",
    "name_en",
    "public"."st_y"("centroid") AS "lat",
    "public"."st_x"("centroid") AS "lon"
   FROM "public"."district";


ALTER VIEW "public"."district_centroid_latlon" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."district_contact" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "district_id" "uuid" NOT NULL,
    "role_title" "text" NOT NULL,
    "phone_placeholder" "text" NOT NULL,
    "is_demo_data" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."district_contact" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."flood_forecast" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "district_id" "uuid" NOT NULL,
    "forecast_date" "date" NOT NULL,
    "river_discharge" numeric,
    "river_discharge_mean" numeric,
    "risk_level" "text" NOT NULL,
    "source" "text" DEFAULT 'open-meteo-flood'::"text" NOT NULL,
    "fetched_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "flood_forecast_risk_level_check" CHECK (("risk_level" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text"])))
);


ALTER TABLE "public"."flood_forecast" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."district_flood_risk_geojson" AS
 SELECT "d"."id" AS "district_id",
    "d"."name_en",
    "ff"."forecast_date",
    "ff"."risk_level",
    "ff"."river_discharge",
    "public"."st_asgeojson"("d"."geom") AS "geometry_json"
   FROM ("public"."district" "d"
     LEFT JOIN LATERAL ( SELECT "f"."id",
            "f"."district_id",
            "f"."forecast_date",
            "f"."river_discharge",
            "f"."river_discharge_mean",
            "f"."risk_level",
            "f"."source",
            "f"."fetched_at"
           FROM "public"."flood_forecast" "f"
          WHERE (("f"."district_id" = "d"."id") AND ("f"."forecast_date" >= CURRENT_DATE))
          ORDER BY "f"."forecast_date"
         LIMIT 1) "ff" ON (true));


ALTER VIEW "public"."district_flood_risk_geojson" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."drought_index" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "district_id" "uuid" NOT NULL,
    "spi_3" numeric NOT NULL,
    "date" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."drought_index" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."glacial_lake" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "valley" "text" NOT NULL,
    "district_id" "uuid",
    "hazard_class" "text" NOT NULL,
    "downstream_population" integer,
    "geom" "public"."geometry"(Point,4326) NOT NULL,
    "source" "text" DEFAULT 'UNDP/ICIMOD'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "glacial_lake_hazard_class_check" CHECK (("hazard_class" = ANY (ARRAY['High'::"text", 'Medium'::"text", 'Low'::"text"])))
);


ALTER TABLE "public"."glacial_lake" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hazard_event" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hazard" "text" NOT NULL,
    "source" "text" NOT NULL,
    "severity" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "geom" "public"."geometry"(Geometry,4326),
    "district_ids" "uuid"[],
    "starts_at" timestamp with time zone,
    "ends_at" timestamp with time zone,
    "raw" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "external_id" "text",
    CONSTRAINT "hazard_event_hazard_check" CHECK (("hazard" = ANY (ARRAY['flood'::"text", 'glof'::"text", 'fire'::"text", 'drought'::"text", 'earthquake'::"text", 'weather'::"text", 'landslide'::"text"]))),
    CONSTRAINT "hazard_event_severity_check" CHECK (("severity" = ANY (ARRAY['advisory'::"text", 'watch'::"text", 'warning'::"text", 'emergency'::"text"])))
);


ALTER TABLE "public"."hazard_event" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ingest_status" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source" "text" NOT NULL,
    "last_success_at" timestamp with time zone,
    "last_error" "text",
    "last_error_at" timestamp with time zone,
    "status" "text" DEFAULT 'unknown'::"text" NOT NULL,
    CONSTRAINT "ingest_status_status_check" CHECK (("status" = ANY (ARRAY['ok'::"text", 'degraded'::"text", 'failed'::"text", 'unknown'::"text"])))
);


ALTER TABLE "public"."ingest_status" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."maintenance_ticket" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "station_id" "uuid",
    "reason" "text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "resolved_at" timestamp with time zone,
    CONSTRAINT "maintenance_ticket_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'in_progress'::"text", 'resolved'::"text"])))
);


ALTER TABLE "public"."maintenance_ticket" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."manual_reading" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source" "text" NOT NULL,
    "station_name" "text" NOT NULL,
    "district_id" "uuid",
    "reading_type" "text" NOT NULL,
    "value" double precision NOT NULL,
    "unit" "text",
    "entered_by" "uuid",
    "entered_at" timestamp with time zone DEFAULT "now"(),
    "notes" "text"
);


ALTER TABLE "public"."manual_reading" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profile" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "role" "public"."app_role" DEFAULT 'viewer'::"public"."app_role" NOT NULL,
    "district_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."profile" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scrape_snapshot" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source" "text" NOT NULL,
    "url" "text" NOT NULL,
    "status_code" integer,
    "raw_html" "text",
    "fetch_error" "text",
    "fetched_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."scrape_snapshot" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."station" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "external_id" "text",
    "kind" "text" NOT NULL,
    "source" "text" NOT NULL,
    "name" "text" NOT NULL,
    "valley" "text",
    "district_id" "uuid",
    "geom" "public"."geometry"(Point,4326) NOT NULL,
    "install_date" "date",
    "hardware" "text",
    "is_simulated" boolean DEFAULT false NOT NULL,
    "meta" "jsonb" DEFAULT '{}'::"jsonb",
    CONSTRAINT "station_kind_check" CHECK (("kind" = ANY (ARRAY['water_level'::"text", 'aws'::"text", 'rain_gauge'::"text", 'discharge'::"text", 'river_gauge_virtual'::"text"])))
);


ALTER TABLE "public"."station" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."station_reading" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "station_id" "uuid" NOT NULL,
    "recorded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "water_level" numeric,
    "rainfall" numeric,
    "temperature" numeric,
    "battery_voltage" numeric,
    "rssi" integer,
    "flow_rate" numeric,
    "is_simulated" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."station_reading" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."station_health" AS
 SELECT "s"."id" AS "station_id",
    "s"."name",
    "s"."kind",
    "s"."district_id",
    "s"."is_simulated",
    "lr"."recorded_at" AS "last_transmission_at",
    "lr"."battery_voltage",
    "lr"."rssi",
    "lr"."water_level",
    "lr"."rainfall",
    "lr"."temperature",
    "lr"."flow_rate",
        CASE
            WHEN ("lr"."recorded_at" IS NULL) THEN 'offline'::"text"
            WHEN (("now"() - "lr"."recorded_at") > '00:30:00'::interval) THEN 'offline'::"text"
            WHEN (("now"() - "lr"."recorded_at") > '00:15:00'::interval) THEN 'degraded'::"text"
            WHEN (("lr"."battery_voltage" IS NOT NULL) AND ("lr"."battery_voltage" < 11.0)) THEN 'degraded'::"text"
            ELSE 'online'::"text"
        END AS "status",
    "public"."st_x"("s"."geom") AS "lon",
    "public"."st_y"("s"."geom") AS "lat"
   FROM ("public"."station" "s"
     LEFT JOIN LATERAL ( SELECT "sr"."id",
            "sr"."station_id",
            "sr"."recorded_at",
            "sr"."water_level",
            "sr"."rainfall",
            "sr"."temperature",
            "sr"."battery_voltage",
            "sr"."rssi",
            "sr"."flow_rate",
            "sr"."is_simulated"
           FROM "public"."station_reading" "sr"
          WHERE ("sr"."station_id" = "s"."id")
          ORDER BY "sr"."recorded_at" DESC
         LIMIT 1) "lr" ON (true));


ALTER VIEW "public"."station_health" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."threshold_rule" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "station_id" "uuid",
    "district_id" "uuid",
    "hazard" "text" NOT NULL,
    "parameter" "text" NOT NULL,
    "operator" "text" NOT NULL,
    "value" double precision NOT NULL,
    "window_minutes" integer,
    "severity" "text" NOT NULL,
    "enabled" boolean DEFAULT true,
    CONSTRAINT "threshold_rule_operator_check" CHECK (("operator" = ANY (ARRAY['gt'::"text", 'gte'::"text", 'lt'::"text", 'rate_gt'::"text"]))),
    CONSTRAINT "threshold_rule_severity_check" CHECK (("severity" = ANY (ARRAY['emergency'::"text", 'warning'::"text", 'watch'::"text", 'advisory'::"text"])))
);


ALTER TABLE "public"."threshold_rule" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."weather_reading" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "district_id" "uuid" NOT NULL,
    "precipitation" double precision,
    "temperature" double precision,
    "snowfall" double precision,
    "fetched_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."weather_reading" OWNER TO "postgres";


ALTER TABLE ONLY "public"."advisory"
    ADD CONSTRAINT "advisory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."alert_candidate"
    ADD CONSTRAINT "alert_candidate_external_id_key" UNIQUE ("external_id");



ALTER TABLE ONLY "public"."alert_candidate"
    ADD CONSTRAINT "alert_candidate_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."alert_delivery"
    ADD CONSTRAINT "alert_delivery_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."alert"
    ADD CONSTRAINT "alert_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."alert_rule"
    ADD CONSTRAINT "alert_rule_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."channel_recipient_count"
    ADD CONSTRAINT "channel_recipient_count_district_id_channel_key" UNIQUE ("district_id", "channel");



ALTER TABLE ONLY "public"."channel_recipient_count"
    ADD CONSTRAINT "channel_recipient_count_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."district"
    ADD CONSTRAINT "district_adm2_code_key" UNIQUE ("adm2_code");



ALTER TABLE ONLY "public"."district_contact"
    ADD CONSTRAINT "district_contact_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."district"
    ADD CONSTRAINT "district_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."drought_index"
    ADD CONSTRAINT "drought_index_district_id_date_key" UNIQUE ("district_id", "date");



ALTER TABLE ONLY "public"."drought_index"
    ADD CONSTRAINT "drought_index_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."flood_forecast"
    ADD CONSTRAINT "flood_forecast_district_id_forecast_date_key" UNIQUE ("district_id", "forecast_date");



ALTER TABLE ONLY "public"."flood_forecast"
    ADD CONSTRAINT "flood_forecast_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."glacial_lake"
    ADD CONSTRAINT "glacial_lake_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hazard_event"
    ADD CONSTRAINT "hazard_event_external_id_key" UNIQUE ("external_id");



ALTER TABLE ONLY "public"."hazard_event"
    ADD CONSTRAINT "hazard_event_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ingest_status"
    ADD CONSTRAINT "ingest_status_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ingest_status"
    ADD CONSTRAINT "ingest_status_source_key" UNIQUE ("source");



ALTER TABLE ONLY "public"."maintenance_ticket"
    ADD CONSTRAINT "maintenance_ticket_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."manual_reading"
    ADD CONSTRAINT "manual_reading_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profile"
    ADD CONSTRAINT "profile_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scrape_snapshot"
    ADD CONSTRAINT "scrape_snapshot_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."station"
    ADD CONSTRAINT "station_external_id_key" UNIQUE ("external_id");



ALTER TABLE ONLY "public"."station"
    ADD CONSTRAINT "station_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."station_reading"
    ADD CONSTRAINT "station_reading_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."threshold_rule"
    ADD CONSTRAINT "threshold_rule_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."weather_reading"
    ADD CONSTRAINT "weather_reading_district_id_key" UNIQUE ("district_id");



ALTER TABLE ONLY "public"."weather_reading"
    ADD CONSTRAINT "weather_reading_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_alert_delivery_alert" ON "public"."alert_delivery" USING "btree" ("alert_id");



CREATE INDEX "idx_alert_delivery_district" ON "public"."alert_delivery" USING "btree" ("district_id");



CREATE INDEX "idx_alert_districts" ON "public"."alert" USING "gin" ("district_ids");



CREATE INDEX "idx_district_geom" ON "public"."district" USING "gist" ("geom");



CREATE INDEX "idx_hazard_event_districts" ON "public"."hazard_event" USING "gin" ("district_ids");



CREATE INDEX "idx_hazard_event_geom" ON "public"."hazard_event" USING "gist" ("geom");



CREATE INDEX "idx_maintenance_ticket_station" ON "public"."maintenance_ticket" USING "btree" ("station_id");



CREATE INDEX "idx_station_district" ON "public"."station" USING "btree" ("district_id");



CREATE INDEX "idx_station_geom" ON "public"."station" USING "gist" ("geom");



CREATE INDEX "idx_threshold_rule_district" ON "public"."threshold_rule" USING "btree" ("district_id");



CREATE INDEX "idx_threshold_rule_station" ON "public"."threshold_rule" USING "btree" ("station_id");



CREATE INDEX "station_reading_station_id_recorded_at_idx" ON "public"."station_reading" USING "btree" ("station_id", "recorded_at" DESC);



CREATE OR REPLACE TRIGGER "alert_audit_trigger" AFTER INSERT OR UPDATE ON "public"."alert" FOR EACH ROW EXECUTE FUNCTION "public"."log_alert_status_change"();



CREATE OR REPLACE TRIGGER "alert_candidate_audit_trigger" AFTER UPDATE ON "public"."alert_candidate" FOR EACH ROW EXECUTE FUNCTION "public"."log_alert_candidate_status_change"();



CREATE OR REPLACE TRIGGER "alert_candidate_insert_audit" AFTER INSERT ON "public"."alert_candidate" FOR EACH ROW EXECUTE FUNCTION "public"."log_alert_candidate_created"();



CREATE OR REPLACE TRIGGER "alert_rule_update_audit" AFTER UPDATE ON "public"."alert_rule" FOR EACH ROW EXECUTE FUNCTION "public"."log_alert_rule_edit"();



CREATE OR REPLACE TRIGGER "audit_log_append_only" BEFORE DELETE OR UPDATE ON "public"."audit_log" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_audit_log_modification"();



CREATE OR REPLACE TRIGGER "manual_reading_alert_trigger" AFTER INSERT ON "public"."manual_reading" FOR EACH ROW EXECUTE FUNCTION "public"."evaluate_manual_reading_alert_rules"();



CREATE OR REPLACE TRIGGER "manual_reading_rate_trigger" AFTER INSERT ON "public"."manual_reading" FOR EACH ROW EXECUTE FUNCTION "public"."evaluate_manual_reading_rate_rules"();



CREATE OR REPLACE TRIGGER "station_reading_alert_trigger" AFTER INSERT ON "public"."station_reading" FOR EACH ROW EXECUTE FUNCTION "public"."evaluate_station_reading_alert_rules"();



CREATE OR REPLACE TRIGGER "station_reading_rate_trigger" AFTER INSERT ON "public"."station_reading" FOR EACH ROW EXECUTE FUNCTION "public"."evaluate_station_reading_rate_rules"();



CREATE OR REPLACE TRIGGER "trigger_alert_candidate_updated_at" BEFORE UPDATE ON "public"."alert_candidate" FOR EACH ROW EXECUTE FUNCTION "public"."update_alert_candidate_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_approve_candidate" AFTER UPDATE ON "public"."alert_candidate" FOR EACH ROW EXECUTE FUNCTION "public"."process_approved_candidate"();



CREATE OR REPLACE TRIGGER "trigger_evaluate_manual_reading" AFTER INSERT OR UPDATE ON "public"."manual_reading" FOR EACH ROW EXECUTE FUNCTION "public"."evaluate_manual_reading"();



CREATE OR REPLACE TRIGGER "trigger_evaluate_weather_reading" AFTER INSERT OR UPDATE ON "public"."weather_reading" FOR EACH ROW EXECUTE FUNCTION "public"."evaluate_weather_reading"();



ALTER TABLE ONLY "public"."advisory"
    ADD CONSTRAINT "advisory_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "public"."district"("id");



ALTER TABLE ONLY "public"."alert_candidate"
    ADD CONSTRAINT "alert_candidate_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "public"."district"("id");



ALTER TABLE ONLY "public"."alert_candidate"
    ADD CONSTRAINT "alert_candidate_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."alert_candidate"
    ADD CONSTRAINT "alert_candidate_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "public"."alert_rule"("id");



ALTER TABLE ONLY "public"."alert_delivery"
    ADD CONSTRAINT "alert_delivery_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "public"."alert_candidate"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."alert_delivery"
    ADD CONSTRAINT "alert_delivery_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "public"."district"("id");



ALTER TABLE ONLY "public"."alert_rule"
    ADD CONSTRAINT "alert_rule_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "public"."district"("id");



ALTER TABLE ONLY "public"."alert"
    ADD CONSTRAINT "alert_source_event_fkey" FOREIGN KEY ("source_event") REFERENCES "public"."hazard_event"("id");



ALTER TABLE ONLY "public"."alert"
    ADD CONSTRAINT "alert_source_rule_fkey" FOREIGN KEY ("source_rule") REFERENCES "public"."threshold_rule"("id");



ALTER TABLE ONLY "public"."channel_recipient_count"
    ADD CONSTRAINT "channel_recipient_count_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "public"."district"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."district_contact"
    ADD CONSTRAINT "district_contact_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "public"."district"("id");



ALTER TABLE ONLY "public"."drought_index"
    ADD CONSTRAINT "drought_index_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "public"."district"("id");



ALTER TABLE ONLY "public"."flood_forecast"
    ADD CONSTRAINT "flood_forecast_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "public"."district"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."glacial_lake"
    ADD CONSTRAINT "glacial_lake_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "public"."district"("id");



ALTER TABLE ONLY "public"."maintenance_ticket"
    ADD CONSTRAINT "maintenance_ticket_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "public"."station"("id");



ALTER TABLE ONLY "public"."manual_reading"
    ADD CONSTRAINT "manual_reading_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "public"."district"("id");



ALTER TABLE ONLY "public"."profile"
    ADD CONSTRAINT "profile_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "public"."district"("id");



ALTER TABLE ONLY "public"."profile"
    ADD CONSTRAINT "profile_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."station"
    ADD CONSTRAINT "station_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "public"."district"("id");



ALTER TABLE ONLY "public"."station_reading"
    ADD CONSTRAINT "station_reading_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "public"."station"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."threshold_rule"
    ADD CONSTRAINT "threshold_rule_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "public"."district"("id");



ALTER TABLE ONLY "public"."threshold_rule"
    ADD CONSTRAINT "threshold_rule_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "public"."station"("id");



ALTER TABLE ONLY "public"."weather_reading"
    ADD CONSTRAINT "weather_reading_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "public"."district"("id");



CREATE POLICY "Allow authenticated select on audit_log" ON "public"."audit_log" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated update access" ON "public"."alert_candidate" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Allow public read access" ON "public"."alert_candidate" FOR SELECT USING (true);



CREATE POLICY "Allow public read access" ON "public"."alert_rule" FOR SELECT USING (true);



CREATE POLICY "Allow public read access" ON "public"."drought_index" FOR SELECT USING (true);



CREATE POLICY "Allow public read access" ON "public"."glacial_lake" FOR SELECT USING (true);



CREATE POLICY "Allow service role full access" ON "public"."alert_candidate" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Allow service role full access" ON "public"."alert_rule" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Allow service role full access" ON "public"."drought_index" TO "service_role" USING (true);



CREATE POLICY "Allow service role full access" ON "public"."glacial_lake" TO "service_role" USING (true);



ALTER TABLE "public"."advisory" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."alert" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."alert_candidate" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."alert_delivery" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "alert_delivery_insert" ON "public"."alert_delivery" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profile"
  WHERE (("profile"."id" = "auth"."uid"()) AND ("profile"."role" = ANY (ARRAY['duty_officer'::"public"."app_role", 'dg'::"public"."app_role"]))))));



CREATE POLICY "alert_delivery_select" ON "public"."alert_delivery" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profile"
  WHERE (("profile"."id" = "auth"."uid"()) AND (("profile"."role" = ANY (ARRAY['duty_officer'::"public"."app_role", 'dg'::"public"."app_role"])) OR ("profile"."district_id" = "alert_delivery"."district_id"))))));



CREATE POLICY "alert_delivery_update" ON "public"."alert_delivery" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profile"
  WHERE (("profile"."id" = "auth"."uid"()) AND ("profile"."role" = ANY (ARRAY['duty_officer'::"public"."app_role", 'dg'::"public"."app_role"]))))));



ALTER TABLE "public"."alert_rule" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "authenticated can read advisories" ON "public"."advisory" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated can read alerts" ON "public"."alert" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated can read contacts" ON "public"."district_contact" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated can read districts" ON "public"."district" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated can read hazard events" ON "public"."hazard_event" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated can read ingest status" ON "public"."ingest_status" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated can read manual readings" ON "public"."manual_reading" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated can read snapshots" ON "public"."scrape_snapshot" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated can read stations" ON "public"."station" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated can read weather" ON "public"."weather_reading" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated staff can read all alert candidates" ON "public"."alert_candidate" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."channel_recipient_count" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "channel_recipient_count_select" ON "public"."channel_recipient_count" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



ALTER TABLE "public"."district" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."district_contact" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."drought_index" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "duty officers and dg can create alerts" ON "public"."alert" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profile"
  WHERE (("profile"."id" = "auth"."uid"()) AND ("profile"."role" = ANY (ARRAY['duty_officer'::"public"."app_role", 'dg'::"public"."app_role"]))))));



CREATE POLICY "duty officers and dg can enter manual readings" ON "public"."manual_reading" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profile"
  WHERE (("profile"."id" = "auth"."uid"()) AND ("profile"."role" = ANY (ARRAY['duty_officer'::"public"."app_role", 'dg'::"public"."app_role"]))))));



CREATE POLICY "duty officers and dg can manage thresholds" ON "public"."threshold_rule" USING ((EXISTS ( SELECT 1
   FROM "public"."profile"
  WHERE (("profile"."id" = "auth"."uid"()) AND ("profile"."role" = ANY (ARRAY['duty_officer'::"public"."app_role", 'dg'::"public"."app_role"]))))));



ALTER TABLE "public"."flood_forecast" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "flood_forecast_insert_service_role" ON "public"."flood_forecast" FOR INSERT TO "service_role" WITH CHECK (true);



CREATE POLICY "flood_forecast_select_authenticated" ON "public"."flood_forecast" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "flood_forecast_update_service_role" ON "public"."flood_forecast" FOR UPDATE TO "service_role" USING (true);



ALTER TABLE "public"."glacial_lake" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hazard_event" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ingest_status" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."maintenance_ticket" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."manual_reading" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profile" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."scrape_snapshot" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."station" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."station_reading" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "station_reading_insert_service_role" ON "public"."station_reading" FOR INSERT TO "service_role" WITH CHECK (true);



CREATE POLICY "station_reading_select_authenticated" ON "public"."station_reading" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."threshold_rule" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users read own profile" ON "public"."profile" FOR SELECT USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."weather_reading" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."evaluate_manual_reading"() TO "anon";
GRANT ALL ON FUNCTION "public"."evaluate_manual_reading"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."evaluate_manual_reading"() TO "service_role";



GRANT ALL ON FUNCTION "public"."evaluate_manual_reading_alert_rules"() TO "anon";
GRANT ALL ON FUNCTION "public"."evaluate_manual_reading_alert_rules"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."evaluate_manual_reading_alert_rules"() TO "service_role";



GRANT ALL ON FUNCTION "public"."evaluate_manual_reading_rate_rules"() TO "anon";
GRANT ALL ON FUNCTION "public"."evaluate_manual_reading_rate_rules"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."evaluate_manual_reading_rate_rules"() TO "service_role";



GRANT ALL ON FUNCTION "public"."evaluate_station_reading_alert_rules"() TO "anon";
GRANT ALL ON FUNCTION "public"."evaluate_station_reading_alert_rules"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."evaluate_station_reading_alert_rules"() TO "service_role";



GRANT ALL ON FUNCTION "public"."evaluate_station_reading_rate_rules"() TO "anon";
GRANT ALL ON FUNCTION "public"."evaluate_station_reading_rate_rules"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."evaluate_station_reading_rate_rules"() TO "service_role";



GRANT ALL ON FUNCTION "public"."evaluate_temperature_threshold"() TO "anon";
GRANT ALL ON FUNCTION "public"."evaluate_temperature_threshold"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."evaluate_temperature_threshold"() TO "service_role";



GRANT ALL ON FUNCTION "public"."evaluate_weather_reading"() TO "anon";
GRANT ALL ON FUNCTION "public"."evaluate_weather_reading"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."evaluate_weather_reading"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_district_hazards"("p_district_id" "uuid", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_district_hazards"("p_district_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_district_hazards"("p_district_id" "uuid", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_district_lonlat"("district_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_district_lonlat"("district_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_district_lonlat"("district_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_district_mask_geojson"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_district_mask_geojson"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_district_mask_geojson"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_districts_geojson"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_districts_geojson"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_districts_geojson"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_drought_geojson"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_drought_geojson"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_drought_geojson"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_glacial_lakes_geojson"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_glacial_lakes_geojson"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_glacial_lakes_geojson"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_hazard_events_geojson"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_hazard_events_geojson"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_hazard_events_geojson"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_alert_candidate_created"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_alert_candidate_created"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_alert_candidate_created"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_alert_candidate_status_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_alert_candidate_status_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_alert_candidate_status_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_alert_rule_edit"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_alert_rule_edit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_alert_rule_edit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_alert_status_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_alert_status_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_alert_status_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_audit_log_modification"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_audit_log_modification"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_audit_log_modification"() TO "service_role";



GRANT ALL ON FUNCTION "public"."process_approved_candidate"() TO "anon";
GRANT ALL ON FUNCTION "public"."process_approved_candidate"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_approved_candidate"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_alert_candidate_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_alert_candidate_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_alert_candidate_updated_at"() TO "service_role";



GRANT ALL ON TABLE "public"."advisory" TO "anon";
GRANT ALL ON TABLE "public"."advisory" TO "authenticated";
GRANT ALL ON TABLE "public"."advisory" TO "service_role";



GRANT ALL ON TABLE "public"."alert" TO "anon";
GRANT ALL ON TABLE "public"."alert" TO "authenticated";
GRANT ALL ON TABLE "public"."alert" TO "service_role";



GRANT ALL ON TABLE "public"."alert_candidate" TO "anon";
GRANT ALL ON TABLE "public"."alert_candidate" TO "authenticated";
GRANT ALL ON TABLE "public"."alert_candidate" TO "service_role";



GRANT ALL ON TABLE "public"."alert_delivery" TO "anon";
GRANT ALL ON TABLE "public"."alert_delivery" TO "authenticated";
GRANT ALL ON TABLE "public"."alert_delivery" TO "service_role";



GRANT ALL ON TABLE "public"."alert_rule" TO "anon";
GRANT ALL ON TABLE "public"."alert_rule" TO "authenticated";
GRANT ALL ON TABLE "public"."alert_rule" TO "service_role";



GRANT ALL ON TABLE "public"."audit_log" TO "anon";
GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."channel_recipient_count" TO "anon";
GRANT ALL ON TABLE "public"."channel_recipient_count" TO "authenticated";
GRANT ALL ON TABLE "public"."channel_recipient_count" TO "service_role";



GRANT ALL ON TABLE "public"."district" TO "anon";
GRANT ALL ON TABLE "public"."district" TO "authenticated";
GRANT ALL ON TABLE "public"."district" TO "service_role";



GRANT ALL ON TABLE "public"."district_centroid_latlon" TO "anon";
GRANT ALL ON TABLE "public"."district_centroid_latlon" TO "authenticated";
GRANT ALL ON TABLE "public"."district_centroid_latlon" TO "service_role";



GRANT ALL ON TABLE "public"."district_contact" TO "anon";
GRANT ALL ON TABLE "public"."district_contact" TO "authenticated";
GRANT ALL ON TABLE "public"."district_contact" TO "service_role";



GRANT ALL ON TABLE "public"."flood_forecast" TO "anon";
GRANT ALL ON TABLE "public"."flood_forecast" TO "authenticated";
GRANT ALL ON TABLE "public"."flood_forecast" TO "service_role";



GRANT ALL ON TABLE "public"."district_flood_risk_geojson" TO "anon";
GRANT ALL ON TABLE "public"."district_flood_risk_geojson" TO "authenticated";
GRANT ALL ON TABLE "public"."district_flood_risk_geojson" TO "service_role";



GRANT ALL ON TABLE "public"."drought_index" TO "anon";
GRANT ALL ON TABLE "public"."drought_index" TO "authenticated";
GRANT ALL ON TABLE "public"."drought_index" TO "service_role";



GRANT ALL ON TABLE "public"."glacial_lake" TO "anon";
GRANT ALL ON TABLE "public"."glacial_lake" TO "authenticated";
GRANT ALL ON TABLE "public"."glacial_lake" TO "service_role";



GRANT ALL ON TABLE "public"."hazard_event" TO "anon";
GRANT ALL ON TABLE "public"."hazard_event" TO "authenticated";
GRANT ALL ON TABLE "public"."hazard_event" TO "service_role";



GRANT ALL ON TABLE "public"."ingest_status" TO "anon";
GRANT ALL ON TABLE "public"."ingest_status" TO "authenticated";
GRANT ALL ON TABLE "public"."ingest_status" TO "service_role";



GRANT ALL ON TABLE "public"."maintenance_ticket" TO "anon";
GRANT ALL ON TABLE "public"."maintenance_ticket" TO "authenticated";
GRANT ALL ON TABLE "public"."maintenance_ticket" TO "service_role";



GRANT ALL ON TABLE "public"."manual_reading" TO "anon";
GRANT ALL ON TABLE "public"."manual_reading" TO "authenticated";
GRANT ALL ON TABLE "public"."manual_reading" TO "service_role";



GRANT ALL ON TABLE "public"."profile" TO "anon";
GRANT ALL ON TABLE "public"."profile" TO "authenticated";
GRANT ALL ON TABLE "public"."profile" TO "service_role";



GRANT ALL ON TABLE "public"."scrape_snapshot" TO "anon";
GRANT ALL ON TABLE "public"."scrape_snapshot" TO "authenticated";
GRANT ALL ON TABLE "public"."scrape_snapshot" TO "service_role";



GRANT ALL ON TABLE "public"."station" TO "anon";
GRANT ALL ON TABLE "public"."station" TO "authenticated";
GRANT ALL ON TABLE "public"."station" TO "service_role";



GRANT ALL ON TABLE "public"."station_reading" TO "anon";
GRANT ALL ON TABLE "public"."station_reading" TO "authenticated";
GRANT ALL ON TABLE "public"."station_reading" TO "service_role";



GRANT ALL ON TABLE "public"."station_health" TO "anon";
GRANT ALL ON TABLE "public"."station_health" TO "authenticated";
GRANT ALL ON TABLE "public"."station_health" TO "service_role";



GRANT ALL ON TABLE "public"."threshold_rule" TO "anon";
GRANT ALL ON TABLE "public"."threshold_rule" TO "authenticated";
GRANT ALL ON TABLE "public"."threshold_rule" TO "service_role";



GRANT ALL ON TABLE "public"."weather_reading" TO "anon";
GRANT ALL ON TABLE "public"."weather_reading" TO "authenticated";
GRANT ALL ON TABLE "public"."weather_reading" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







