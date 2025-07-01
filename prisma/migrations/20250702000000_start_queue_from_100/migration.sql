-- Reset the queue numbering to start from 100
-- This migration file should be applied only when the queue table is empty

-- Update existing queue items to have positions starting from 100
-- We do this in a way that preserves the relative order
-- First, we update all positions temporarily to negative values to avoid conflicts
UPDATE "Queue"
SET position = (position * -1) - 1000;

-- Then update to the new positive values starting from 100
UPDATE "Queue"
SET position = ((position * -1) - 1000) + 100;
