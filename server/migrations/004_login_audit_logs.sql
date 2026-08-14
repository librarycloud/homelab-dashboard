-- Run once for databases created before login auditing was added.
CREATE TABLE IF NOT EXISTS login_audit_logs (
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
