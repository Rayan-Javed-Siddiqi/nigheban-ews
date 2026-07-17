import psycopg2
import sys

CONN_STRING = "postgresql://postgres.ksdcjwpbusadklpdwfsz:testnigheban@aws-1-ap-south-1.pooler.supabase.com:6543/postgres"

SQL = """
-- 3. Evaluation Function & Trigger for weather_reading
CREATE OR REPLACE FUNCTION public.evaluate_weather_reading()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    rule RECORD;
    val NUMERIC;
    geom_val geometry;
BEGIN
    -- Evaluate precipitation
    IF NEW.precipitation IS NOT NULL THEN
        FOR rule IN SELECT * FROM public.alert_rule WHERE metric_name = 'precipitation' AND is_active = true AND (district_id IS NULL OR district_id = NEW.district_id) ORDER BY threshold_value DESC LOOP
            val := NEW.precipitation;
            IF (rule.operator = '>' AND val > rule.threshold_value) OR
               (rule.operator = '>=' AND val >= rule.threshold_value) OR
               (rule.operator = '<' AND val < rule.threshold_value) OR
               (rule.operator = '<=' AND val <= rule.threshold_value) THEN
               
                SELECT geom INTO geom_val FROM public.district WHERE id = NEW.district_id LIMIT 1;
                
                INSERT INTO public.hazard_event (
                    hazard, source, severity, title, description, geom, district_ids, starts_at, ends_at, external_id
                ) VALUES (
                    'weather', 'Alert Engine', rule.severity, 
                    REPLACE(REPLACE(rule.title_template, '{value}', val::text), '{threshold}', rule.threshold_value::text),
                    REPLACE(REPLACE(rule.description_template, '{value}', val::text), '{threshold}', rule.threshold_value::text),
                    geom_val,
                    ARRAY[NEW.district_id],
                    NEW.fetched_at,
                    NEW.fetched_at + INTERVAL '24 hours',
                    'weather_precip_' || NEW.id::text
                )
                ON CONFLICT (external_id) DO UPDATE SET
                    severity = EXCLUDED.severity,
                    title = EXCLUDED.title,
                    description = EXCLUDED.description;
                    
                -- Break the loop to only trigger the highest threshold
                EXIT;
            END IF;
        END LOOP;
    END IF;

    -- Evaluate temperature
    IF NEW.temperature IS NOT NULL THEN
        FOR rule IN SELECT * FROM public.alert_rule WHERE metric_name = 'temperature' AND is_active = true AND (district_id IS NULL OR district_id = NEW.district_id) ORDER BY threshold_value DESC LOOP
            val := NEW.temperature;
            IF (rule.operator = '>' AND val > rule.threshold_value) OR
               (rule.operator = '>=' AND val >= rule.threshold_value) OR
               (rule.operator = '<' AND val < rule.threshold_value) OR
               (rule.operator = '<=' AND val <= rule.threshold_value) THEN
               
                SELECT geom INTO geom_val FROM public.district WHERE id = NEW.district_id LIMIT 1;
                
                INSERT INTO public.hazard_event (
                    hazard, source, severity, title, description, geom, district_ids, starts_at, ends_at, external_id
                ) VALUES (
                    'weather', 'Alert Engine', rule.severity, 
                    REPLACE(REPLACE(rule.title_template, '{value}', val::text), '{threshold}', rule.threshold_value::text),
                    REPLACE(REPLACE(rule.description_template, '{value}', val::text), '{threshold}', rule.threshold_value::text),
                    geom_val,
                    ARRAY[NEW.district_id],
                    NEW.fetched_at,
                    NEW.fetched_at + INTERVAL '24 hours',
                    'weather_temp_' || NEW.id::text
                )
                ON CONFLICT (external_id) DO UPDATE SET
                    severity = EXCLUDED.severity,
                    title = EXCLUDED.title,
                    description = EXCLUDED.description;
                    
                -- Break the loop to only trigger the highest threshold
                EXIT;
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$;

-- 4. Evaluation Function & Trigger for manual_reading
CREATE OR REPLACE FUNCTION public.evaluate_manual_reading()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    rule RECORD;
    val NUMERIC;
    geom_val geometry;
BEGIN
    IF NEW.value IS NOT NULL AND NEW.reading_type IN ('water_level', 'discharge') THEN
        FOR rule IN SELECT * FROM public.alert_rule WHERE metric_name = 'water_level' AND is_active = true AND (district_id IS NULL OR district_id = NEW.district_id) ORDER BY threshold_value DESC LOOP
            val := NEW.value;
            IF (rule.operator = '>' AND val > rule.threshold_value) OR
               (rule.operator = '>=' AND val >= rule.threshold_value) OR
               (rule.operator = '<' AND val < rule.threshold_value) OR
               (rule.operator = '<=' AND val <= rule.threshold_value) THEN
               
                SELECT geom INTO geom_val FROM public.district WHERE id = NEW.district_id LIMIT 1;
                
                INSERT INTO public.hazard_event (
                    hazard, source, severity, title, description, geom, district_ids, starts_at, ends_at, external_id
                ) VALUES (
                    'flood', 'Alert Engine', rule.severity, 
                    REPLACE(REPLACE(rule.title_template, '{value}', val::text), '{threshold}', rule.threshold_value::text),
                    REPLACE(REPLACE(rule.description_template, '{value}', val::text), '{threshold}', rule.threshold_value::text),
                    geom_val,
                    ARRAY[NEW.district_id],
                    NEW.entered_at,
                    NEW.entered_at + INTERVAL '24 hours',
                    'manual_water_' || NEW.id::text
                )
                ON CONFLICT (external_id) DO UPDATE SET
                    severity = EXCLUDED.severity,
                    title = EXCLUDED.title,
                    description = EXCLUDED.description;
                    
                -- Break the loop to only trigger the highest threshold
                EXIT;
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$;
"""

def main():
    try:
        conn = psycopg2.connect(CONN_STRING)
        cur = conn.cursor()
        cur.execute(SQL)
        conn.commit()
        print("Triggers updated with ORDER BY DESC and EXIT.")
    except Exception as e:
        print(f"Update failed: {e}")
        sys.exit(1)
    finally:
        if 'conn' in locals() and conn:
            conn.close()

if __name__ == "__main__":
    main()
