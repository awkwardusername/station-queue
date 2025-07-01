-- Create a trigger to clean up lastPosition entries when stations are deleted
-- This provides an extra safety mechanism at the database level

-- Create a function that will be called by the trigger
CREATE OR REPLACE FUNCTION delete_station_lastposition()
RETURNS TRIGGER AS $$
BEGIN
    -- Delete the lastPosition entry for this station
    DELETE FROM "Config" WHERE key = 'lastPosition:' || OLD.id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger that calls our function after a station is deleted
DROP TRIGGER IF EXISTS station_delete_cleanup ON "Station";
CREATE TRIGGER station_delete_cleanup
AFTER DELETE ON "Station"
FOR EACH ROW
EXECUTE FUNCTION delete_station_lastposition();
