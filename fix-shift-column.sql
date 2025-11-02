-- Fix shift column type from VARCHAR to NUMERIC
-- Run this SQL script manually in your PostgreSQL database

-- Option 1: If there's no data or you can lose data in shift column
-- ALTER TABLE work_shifts DROP COLUMN shift;
-- ALTER TABLE work_shifts ADD COLUMN shift DECIMAL(10,1);

-- Option 2: If you want to preserve data (recommended)
ALTER TABLE work_shifts 
ALTER COLUMN shift TYPE DECIMAL(10,1) 
USING CASE 
    WHEN shift IS NULL THEN NULL
    WHEN shift ~ '^[0-9]+\.?[0-9]*$' THEN shift::numeric(10,1)
    ELSE NULL
END;

-- Verify the change
SELECT column_name, data_type, numeric_precision, numeric_scale 
FROM information_schema.columns 
WHERE table_name = 'work_shifts' AND column_name = 'shift';


