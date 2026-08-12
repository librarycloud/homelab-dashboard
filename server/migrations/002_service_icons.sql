-- Run once for databases created before service icons were added.
ALTER TABLE services
  ADD COLUMN icon VARCHAR(32) NOT NULL DEFAULT 'Monitor' AFTER category;
