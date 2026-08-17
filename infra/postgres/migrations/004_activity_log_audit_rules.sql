-- Audit records are append-only. No normal application role may edit or delete them.
CREATE OR REPLACE FUNCTION reject_activity_log_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Activity logs are append-only';
END; $$;

DROP TRIGGER IF EXISTS activity_logs_append_only ON activity_logs;
CREATE TRIGGER activity_logs_append_only
  BEFORE UPDATE OR DELETE ON activity_logs
  FOR EACH ROW EXECUTE FUNCTION reject_activity_log_mutation();

-- Managers may review business activity, but still cannot administer users or roles.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.name = 'Manager' AND p.key = 'system.activity_logs.view'
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_activity_logs_module_action ON activity_logs(module, action);
CREATE INDEX IF NOT EXISTS idx_activity_logs_status ON activity_logs(status);
