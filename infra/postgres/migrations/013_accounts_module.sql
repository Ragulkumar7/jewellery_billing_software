-- 013_accounts_module.sql
-- Accounts Module:
--   * expenses get workflow/audit + payment columns (status, payment_reference, payment_date, approval/payment audit)
--   * payments get payment_date
--   * new permissions accounts.payment.cancel + accounts.purchase.export

-- ---------- expenses ----------
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Pending';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS payment_reference text;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS payment_date date;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES users(id);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS paid_by uuid REFERENCES users(id);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE expenses ALTER COLUMN expense_number SET DEFAULT ('EXP-' || to_char(current_date, 'YYYY') || '-' || nextval('expense_number_seq'));
ALTER TABLE expenses ADD CONSTRAINT expenses_status_check CHECK (status IN ('Pending', 'Approved', 'Paid', 'Cancelled'));
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date DESC);

-- ---------- payments ----------
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_date date NOT NULL DEFAULT current_date;
CREATE INDEX IF NOT EXISTS idx_payments_direction ON payments(direction, payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_payments_reference ON payments(reference);

-- ---------- permissions ----------
INSERT INTO permissions(key, module, resource, action) VALUES
  ('accounts.payment.cancel','Accounts','payment','cancel'),
  ('accounts.purchase.export','Accounts','purchase','export')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON (
  r.name IN ('Master Admin', 'Manager', 'Accounts User')
  AND p.key IN ('accounts.payment.cancel', 'accounts.purchase.export')
)
ON CONFLICT DO NOTHING;
