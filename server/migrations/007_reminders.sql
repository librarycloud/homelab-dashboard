-- Migration 007: General reminders / todos table
CREATE TABLE IF NOT EXISTS reminders (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT NULL,
  -- Category: free-form tag, e.g. '税务', '公司合规', '订阅续费', '运维', '其他'
  category VARCHAR(50) NULL,
  -- Recurrence: 'once' | 'yearly' | 'monthly'
  recur_type VARCHAR(10) NOT NULL DEFAULT 'yearly',
  -- Period / Date Range support:
  -- For yearly/monthly window start:
  start_month TINYINT UNSIGNED NULL,
  start_day   TINYINT UNSIGNED NULL,
  -- For yearly/monthly window deadline / end:
  recur_month TINYINT UNSIGNED NULL,
  recur_day   TINYINT UNSIGNED NULL,
  -- One-off date range:
  start_date DATETIME NULL,
  due_date   DATETIME NULL,
  -- How many days before window to alert (default 30)
  remind_days_before INT UNSIGNED NOT NULL DEFAULT 30,
  -- 'pending' | 'done' | 'snoozed'
  status VARCHAR(10) NOT NULL DEFAULT 'pending',
  -- Optional quick-action link
  action_url VARCHAR(500) NULL,
  action_label VARCHAR(100) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_reminders_status (status),
  INDEX idx_reminders_category (category),
  INDEX idx_reminders_sort (sort_order)
);
