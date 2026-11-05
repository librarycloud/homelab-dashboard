CREATE TABLE IF NOT EXISTS notification_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  channel VARCHAR(30) NOT NULL DEFAULT 'telegram',
  category VARCHAR(50) NOT NULL,
  target_type VARCHAR(50) NULL,
  target_id INT UNSIGNED NULL,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'success',
  error_message TEXT NULL,
  sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notif_target (target_type, target_id, sent_at),
  INDEX idx_notif_category (category),
  INDEX idx_notif_sent_at (sent_at)
);
