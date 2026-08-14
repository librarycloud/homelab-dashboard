CREATE DATABASE IF NOT EXISTS homelab_dashboard
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE homelab_dashboard;

CREATE TABLE services (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255) NULL,
  category VARCHAR(50) NULL,
  icon VARCHAR(32) NOT NULL DEFAULT 'Monitor',
  sort_order INT NOT NULL DEFAULT 0,
  -- 0=offline, 1=running, 2=warning, 3=error, 4=maintenance
  status TINYINT UNSIGNED NOT NULL DEFAULT 0,

  github_url VARCHAR(500) NULL,
  lan_url VARCHAR(500) NULL,
  wan_url VARCHAR(500) NULL,
  local_path VARCHAR(500) NULL,
  -- 0=manual, 1=git_tag, 2=git_release, 3=package_json, 4=docker
  version_type TINYINT UNSIGNED NOT NULL DEFAULT 0,
  local_version VARCHAR(80) NULL,
  remote_version VARCHAR(80) NULL,
  -- 0=unknown, 1=latest, 2=update_available, 3=check_failed
  version_status TINYINT UNSIGNED NOT NULL DEFAULT 0,

  docker_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  docker_name VARCHAR(150) NULL,
  docker_image VARCHAR(255) NULL,
  -- 0=unknown, 1=running, 2=stopped, 3=exited, 4=unhealthy
  docker_status TINYINT UNSIGNED NOT NULL DEFAULT 0,
  docker_health VARCHAR(30) NULL,
  docker_restart_count INT UNSIGNED NOT NULL DEFAULT 0,
  docker_last_check_at DATETIME NULL,

  frp_public_ip VARCHAR(45) NULL,
  frp_username VARCHAR(100) NULL,
  frp_password TEXT NULL,

  favorite BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT NULL,
  last_check_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_services_status (status),
  INDEX idx_services_favorite (favorite)
);

CREATE TABLE login_audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL,
  success BOOLEAN NOT NULL,
  failure_reason VARCHAR(50) NULL,
  ip_address VARCHAR(45) NOT NULL,
  remote_address VARCHAR(45) NULL,
  proxy_chain VARCHAR(1000) NULL,
  user_agent VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_login_audit_created_at (created_at),
  INDEX idx_login_audit_success_created (success, created_at),
  INDEX idx_login_audit_ip_created (ip_address, created_at)
);
