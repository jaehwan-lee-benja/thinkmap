-- Create todo_history table to track all changes
CREATE TABLE IF NOT EXISTS todo_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  todo_id UUID NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  previous_text TEXT NOT NULL,
  new_text TEXT NOT NULL,
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_todo_history_todo_id ON todo_history(todo_id);
CREATE INDEX IF NOT EXISTS idx_todo_history_changed_at ON todo_history(changed_at DESC);

-- Enable RLS (Row Level Security)
ALTER TABLE todo_history ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations (adjust based on your auth requirements)
CREATE POLICY "Enable all access for todo_history" ON todo_history
  FOR ALL
  USING (true)
  WITH CHECK (true);
