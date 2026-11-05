-- Migration 010: Add completed cycle tracking to reminders
ALTER TABLE reminders
  ADD COLUMN last_completed_cycle VARCHAR(20) NULL DEFAULT NULL AFTER status,
  ADD COLUMN last_completed_at DATETIME NULL DEFAULT NULL AFTER last_completed_cycle;
