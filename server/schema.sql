CREATE DATABASE IF NOT EXISTS homelab_dashboard
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE homelab_dashboard;

CREATE TABLE services (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255) NULL,
  category VARCHAR(50) NULL,
  status ENUM('running', 'warning', 'error', 'offline', 'maintenance') NOT NULL DEFAULT 'offline',

  github_url VARCHAR(500) NULL,
  lan_url VARCHAR(500) NULL,
  wan_url VARCHAR(500) NULL,
  local_path VARCHAR(500) NULL,
  version_type ENUM('git_tag', 'git_release', 'package_json', 'docker', 'manual') NOT NULL DEFAULT 'manual',
  local_version VARCHAR(80) NULL,
  remote_version VARCHAR(80) NULL,
  version_status ENUM('latest', 'update_available', 'unknown', 'check_failed') NOT NULL DEFAULT 'unknown',

  docker_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  docker_name VARCHAR(150) NULL,
  docker_image VARCHAR(255) NULL,
  docker_status ENUM('running', 'stopped', 'exited', 'unhealthy', 'unknown') NOT NULL DEFAULT 'unknown',
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
