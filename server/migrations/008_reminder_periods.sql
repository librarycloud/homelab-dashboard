-- Migration 008: Add period / date range support to reminders
ALTER TABLE reminders
  ADD COLUMN start_month TINYINT UNSIGNED NULL AFTER recur_type,
  ADD COLUMN start_day TINYINT UNSIGNED NULL AFTER start_month,
  ADD COLUMN start_date DATETIME NULL AFTER due_date;
