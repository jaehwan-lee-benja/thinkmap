-- Add changed_on_date column to todo_history table
-- This column stores which date page the todo was on when it was changed
ALTER TABLE todo_history
ADD COLUMN changed_on_date DATE;

-- Add comment to explain the column
COMMENT ON COLUMN todo_history.changed_on_date IS 'The date page where the todo was located when this change occurred';
