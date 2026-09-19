CREATE TABLE IF NOT EXISTS domains (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  domain_name VARCHAR(255) NOT NULL,
  category VARCHAR(50) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  expiration_date DATETIME NULL,
  registrar_name VARCHAR(100) NULL,
  registrar_url VARCHAR(500) NULL,
  dns_provider_name VARCHAR(100) NULL,
  dns_provider_url VARCHAR(500) NULL,
  notes TEXT NULL,
  auto_update BOOLEAN NOT NULL DEFAULT TRUE,
  last_check_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX idx_domains_domain_name (domain_name)
);
