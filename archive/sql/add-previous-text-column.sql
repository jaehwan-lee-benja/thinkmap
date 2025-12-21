-- Add previous_text column to todos table to track last change
ALTER TABLE todos
ADD COLUMN IF NOT EXISTS previous_text TEXT;
