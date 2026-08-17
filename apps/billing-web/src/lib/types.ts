// System module types (used by Users & Roles, Settings, Activity Log views).
// These are shared with the Node API + PostgreSQL backend.

export type SystemUser = {
  id: string;
  name: string;
  username: string;
  email: string;
  role: string;
  status: string;
  last_login: string | null;
  created_at: string;
};

export type SystemRole = {
  id: string;
  name: string;
  description: string | null;
  permissions: Record<string, string[]>;
  is_system: boolean;
  created_at: string;
};

export type ActivityLog = {
  id: string;
  user_name: string;
  module: string;
  action: string;
  record_id: string | null;
  record_type: string | null;
  status: string;
  previous_value: string | null;
  new_value: string | null;
  remarks: string | null;
  ip_address: string | null;
  device_info: string | null;
  created_at: string;
};

export type SystemSetting = {
  id: string;
  setting_key: string;
  setting_group: string;
  setting_value: { value: unknown };
  description: string | null;
  updated_by: string | null;
  updated_at: string;
};