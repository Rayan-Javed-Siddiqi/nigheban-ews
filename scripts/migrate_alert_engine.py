import psycopg2
import sys

CONN_STRING = "postgresql://postgres.ksdcjwpbusadklpdwfsz:testnigheban@aws-1-ap-south-1.pooler.supabase.com:6543/postgres"

SQL = """
-- 1. Create alert_rule table
CREATE TABLE IF NOT EXISTS public.alert_rule (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_name TEXT NOT NULL,
    district_id UUID REFERENCES public.district(id),
    operator TEXT NOT NULL CHECK (operator IN ('>', '>=', '<', '<=', '=')),
    threshold_value NUMERIC NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('watch', 'warning', 'emergency')),
    title_template TEXT NOT NULL,
    description_template TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.alert_rule ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read access" ON public.alert_rule;
CREATE POLICY "Allow public read access" ON public.alert_rule FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Allow service role full access" ON public.alert_rule;
CREATE POLICY "Allow service role full access" ON public.alert_rule TO service_role USING (true) WITH CHECK (true);

-- 2. Seed Default Rules
TRUNCATE public.alert_rule;
INSERT INTO public.alert_rule (metric_name, operator, threshold_value, severity, title_template, description_template) VALUES
('precipitation', '>', 50, 'warning', 'High Rainfall Alert', 'Precipitation of {value} mm detected, exceeding the 50mm warning threshold.'),
('precipitation', '>', 100, 'emergency', 'Extreme Rainfall Alert', 'Precipitation of {value} mm detected, exceeding the 100mm emergency threshold.'),
('temperature', '>', 45, 'warning', 'Extreme Heat Alert', 'Temperature of {value}°C detected, exceeding the 45°C warning threshold.'),
('temperature', '>', 48, 'emergency', 'Severe Heatwave Alert', 'Temperature of {value}°C detected, exceeding the 48°C emergency threshold.'),
('water_level', '>', 5, 'watch', 'High River Level', 'Water level of {value}m reported, exceeding the 5m watch threshold.'),
('water_level', '>', 7, 'warning', 'Flood Warning', 'Water level of {value}m reported, exceeding the 7m warning threshold.');

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
        FOR rule IN SELECT * FROM public.alert_rule WHERE metric_name = 'precipitation' AND is_active = true AND (district_id IS NULL OR district_id = NEW.district_id) LOOP
            val := NEW.precipitation;
            IF (rule.operator = '>' AND val > rule.threshold_value) OR
               (rule.operator = '>=' AND val >= rule.threshold_value) OR
               (rule.operator = '<' AND val < rule.threshold_value) OR
               (rule.operator = '<=' AND val <= rule.threshold_value) THEN
               
                SELECT geom INTO geom_val FROM public.district WHERE id = NEW.district_id LIMIT 1;
                
                INSERT INTO public.hazard_event (
                    hazard, source, severity, title, description, geom, district_ids, starts_at, ends_at, external_id
                ) VALUES (
                    'Extreme Rainfall', 'Alert Engine', rule.severity, 
                    REPLACE(REPLACE(rule.title_template, '{value}', val::text), '{threshold}', rule.threshold_value::text),
                    REPLACE(REPLACE(rule.description_template, '{value}', val::text), '{threshold}', rule.threshold_value::text),
                    geom_val,
                    ARRAY[NEW.district_id],
                    NEW.fetched_at,
                    NEW.fetched_at + INTERVAL '24 hours',
                    'weather_precip_' || NEW.id::text
                )
                ON CONFLICT (external_id) DO NOTHING;
            END IF;
        END LOOP;
    END IF;

    -- Evaluate temperature
    IF NEW.temperature IS NOT NULL THEN
        FOR rule IN SELECT * FROM public.alert_rule WHERE metric_name = 'temperature' AND is_active = true AND (district_id IS NULL OR district_id = NEW.district_id) LOOP
            val := NEW.temperature;
            IF (rule.operator = '>' AND val > rule.threshold_value) OR
               (rule.operator = '>=' AND val >= rule.threshold_value) OR
               (rule.operator = '<' AND val < rule.threshold_value) OR
               (rule.operator = '<=' AND val <= rule.threshold_value) THEN
               
                SELECT geom INTO geom_val FROM public.district WHERE id = NEW.district_id LIMIT 1;
                
                INSERT INTO public.hazard_event (
                    hazard, source, severity, title, description, geom, district_ids, starts_at, ends_at, external_id
                ) VALUES (
                    'Extreme Heat', 'Alert Engine', rule.severity, 
                    REPLACE(REPLACE(rule.title_template, '{value}', val::text), '{threshold}', rule.threshold_value::text),
                    REPLACE(REPLACE(rule.description_template, '{value}', val::text), '{threshold}', rule.threshold_value::text),
                    geom_val,
                    ARRAY[NEW.district_id],
                    NEW.fetched_at,
                    NEW.fetched_at + INTERVAL '24 hours',
                    'weather_temp_' || NEW.id::text
                )
                ON CONFLICT (external_id) DO NOTHING;
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_evaluate_weather_reading ON public.weather_reading;
CREATE TRIGGER trigger_evaluate_weather_reading
AFTER INSERT OR UPDATE ON public.weather_reading
FOR EACH ROW EXECUTE FUNCTION public.evaluate_weather_reading();


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
        FOR rule IN SELECT * FROM public.alert_rule WHERE metric_name = 'water_level' AND is_active = true AND (district_id IS NULL OR district_id = NEW.district_id) LOOP
            val := NEW.value;
            IF (rule.operator = '>' AND val > rule.threshold_value) OR
               (rule.operator = '>=' AND val >= rule.threshold_value) OR
               (rule.operator = '<' AND val < rule.threshold_value) OR
               (rule.operator = '<=' AND val <= rule.threshold_value) THEN
               
                SELECT geom INTO geom_val FROM public.district WHERE id = NEW.district_id LIMIT 1;
                
                INSERT INTO public.hazard_event (
                    hazard, source, severity, title, description, geom, district_ids, starts_at, ends_at, external_id
                ) VALUES (
                    'Flood', 'Alert Engine', rule.severity, 
                    REPLACE(REPLACE(rule.title_template, '{value}', val::text), '{threshold}', rule.threshold_value::text),
                    REPLACE(REPLACE(rule.description_template, '{value}', val::text), '{threshold}', rule.threshold_value::text),
                    geom_val,
                    ARRAY[NEW.district_id],
                    NEW.entered_at,
                    NEW.entered_at + INTERVAL '24 hours',
                    'manual_water_' || NEW.id::text
                )
                ON CONFLICT (external_id) DO NOTHING;
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_evaluate_manual_reading ON public.manual_reading;
CREATE TRIGGER trigger_evaluate_manual_reading
AFTER INSERT OR UPDATE ON public.manual_reading
FOR EACH ROW EXECUTE FUNCTION public.evaluate_manual_reading();

"""

def main():
    print("Connecting to database...")
    try:
        conn = psycopg2.connect(CONN_STRING)
        cur = conn.cursor()
        print("Executing migration...")
        cur.execute(SQL)
        conn.commit()
        print("Migration successful.")
    except Exception as e:
        print(f"Migration failed: {e}")
        sys.exit(1)
    finally:
        if 'conn' in locals() and conn:
            conn.close()

if __name__ == "__main__":
    main()
