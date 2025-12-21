-- Add completed_at column to track when todo was completed
ALTER TABLE todos
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_todos_completed_at ON todos(completed_at);

-- Add comment
COMMENT ON COLUMN todos.completed_at IS 'Timestamp when the todo was marked as completed';

-- Update existing completed todos with current timestamp (migration)
UPDATE todos
SET completed_at = updated_at
WHERE completed = true AND completed_at IS NULL;
