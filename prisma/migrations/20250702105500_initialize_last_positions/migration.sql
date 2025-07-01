-- Initialize lastPosition values for existing stations
-- This migration ensures that we have lastPosition records for all stations

-- Helper function to insert the lastPosition records
CREATE OR REPLACE FUNCTION initialize_last_positions() 
RETURNS void AS $$
DECLARE
    station_record RECORD;
    max_position INTEGER;
    position_key TEXT;
BEGIN
    FOR station_record IN SELECT id FROM "Station" LOOP
        -- Find the maximum position for this station
        SELECT COALESCE(MAX(position), 99) INTO max_position 
        FROM "Queue" 
        WHERE "stationId" = station_record.id;
        
        -- Create the config entry for this station
        position_key := 'lastPosition:' || station_record.id;
        
        -- Insert or update the config entry
        INSERT INTO "Config" (key, value)
        VALUES (position_key, max_position::TEXT)
        ON CONFLICT (key) DO UPDATE 
        SET value = max_position::TEXT;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Execute the function
SELECT initialize_last_positions();

-- Clean up - drop the function when done
DROP FUNCTION initialize_last_positions();
