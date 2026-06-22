-- SQL MIGRATION SCRIPT
-- Run this in your Supabase SQL Editor to apply Option A

-- 1. Add the new columns
ALTER TABLE public.sessions 
  ADD COLUMN IF NOT EXISTS participants_list text[];

-- If your schema already has created_by, we ensure it exists.
-- If it already exists, this command does nothing but ensures safety.
ALTER TABLE public.sessions 
  ADD COLUMN IF NOT EXISTS created_by text;

-- 2. Clean up old unused columns if they exist (optional)
ALTER TABLE public.sessions 
  DROP COLUMN IF EXISTS participant;

-- 3. (Optional) Backfill existing data so old history shows up correctly
-- This extracts the owner and participants from the JSONB 'data' column
UPDATE public.sessions
SET 
  created_by = data->>'owner',
  participants_list = ARRAY(
    SELECT jsonb_array_elements(data->'participants')->>'name'
  )
WHERE created_by IS NULL;
