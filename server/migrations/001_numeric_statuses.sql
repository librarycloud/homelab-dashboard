-- Run once for databases created with the earlier ENUM schema.
-- The target database is selected by the mariadb command.

ALTER TABLE services
  ADD COLUMN status_new TINYINT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN version_type_new TINYINT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN version_status_new TINYINT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN docker_status_new TINYINT UNSIGNED NOT NULL DEFAULT 0;

UPDATE services SET
  status_new = CASE status
    WHEN 'running' THEN 1 WHEN 'warning' THEN 2 WHEN 'error' THEN 3
    WHEN 'maintenance' THEN 4 ELSE 0 END,
  version_type_new = CASE version_type
    WHEN 'git_tag' THEN 1 WHEN 'git_release' THEN 2 WHEN 'package_json' THEN 3
    WHEN 'docker' THEN 4 ELSE 0 END,
  version_status_new = CASE version_status
    WHEN 'latest' THEN 1 WHEN 'update_available' THEN 2 WHEN 'check_failed' THEN 3
    ELSE 0 END,
  docker_status_new = CASE docker_status
    WHEN 'running' THEN 1 WHEN 'stopped' THEN 2 WHEN 'exited' THEN 3
    WHEN 'unhealthy' THEN 4 ELSE 0 END;

ALTER TABLE services DROP INDEX idx_services_status;
ALTER TABLE services
  DROP COLUMN status,
  DROP COLUMN version_type,
  DROP COLUMN version_status,
  DROP COLUMN docker_status,
  CHANGE COLUMN status_new status TINYINT UNSIGNED NOT NULL DEFAULT 0,
  CHANGE COLUMN version_type_new version_type TINYINT UNSIGNED NOT NULL DEFAULT 0,
  CHANGE COLUMN version_status_new version_status TINYINT UNSIGNED NOT NULL DEFAULT 0,
  CHANGE COLUMN docker_status_new docker_status TINYINT UNSIGNED NOT NULL DEFAULT 0,
  ADD INDEX idx_services_status (status);
