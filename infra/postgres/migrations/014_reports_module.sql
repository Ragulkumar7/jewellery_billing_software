-- 014_reports_module.sql
-- Reports Module permissions:
--   * granular per-report export permissions (sales / business / gst / inventory)
--   * Sales Executive gets read + export access to the Sales Report only
--   * generic reports.export remains as a fallback for broad roles

-- ---------- permissions ----------
INSERT INTO permissions(key, module, resource, action) VALUES
  ('reports.sales.export',    'Reports', 'sales',    'export'),
  ('reports.business.export', 'Reports', 'business', 'export'),
  ('reports.gst.export',      'Reports', 'gst',      'export'),
  ('reports.inventory.export','Reports', 'inventory','export')
ON CONFLICT (key) DO NOTHING;

-- Master Admin + Manager: all report exports
INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON (
  r.name IN ('Master Admin', 'Manager')
  AND p.key IN ('reports.sales.export', 'reports.business.export', 'reports.gst.export', 'reports.inventory.export')
)
ON CONFLICT DO NOTHING;

-- Accounts User: relevant export permissions (business, gst, inventory)
INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON (
  r.name = 'Accounts User'
  AND p.key IN ('reports.business.export', 'reports.gst.export', 'reports.inventory.export')
)
ON CONFLICT DO NOTHING;

-- Sales Executive: can view AND export the Sales Report (not other reports)
INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON (
  r.name = 'Sales Executive'
  AND p.key IN ('reports.sales.view', 'reports.sales.export')
)
ON CONFLICT DO NOTHING;
