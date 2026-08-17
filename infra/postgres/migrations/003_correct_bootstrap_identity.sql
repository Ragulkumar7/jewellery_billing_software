-- Keep the local bootstrap account labels consistent with their actual roles.
UPDATE users
SET name = 'Manager', first_name = 'Manager', last_name = '', username = 'manager'
WHERE lower(email) = 'manager@opalline.in';

UPDATE users
SET name = 'Master Admin', first_name = 'Master', last_name = '', username = 'master.admin.control'
WHERE lower(email) = 'master@opalline.in';
