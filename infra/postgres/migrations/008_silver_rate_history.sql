-- Silver rate history audit trail. Each rate change records the previous and new
-- rate so the UI can display change deltas without reconstructing history.

CREATE TABLE IF NOT EXISTS silver_rate_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purity text NOT NULL DEFAULT '92.5',
  previous_rate numeric(14,2) NOT NULL DEFAULT 0,
  new_rate numeric(14,2) NOT NULL,
  rate_change numeric(14,2) NOT NULL DEFAULT 0,
  effective_date date NOT NULL DEFAULT current_date,
  effective_time time NOT NULL DEFAULT current_time,
  remarks text,
  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_silver_rate_history_effective ON silver_rate_history(effective_date DESC, effective_time DESC);