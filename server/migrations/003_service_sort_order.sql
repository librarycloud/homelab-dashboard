-- Run once for databases created before custom service ordering was added.
ALTER TABLE services
  ADD COLUMN sort_order INT NOT NULL DEFAULT 0 AFTER icon;

SET @sort := -1;
UPDATE services
SET sort_order = (@sort := @sort + 1)
ORDER BY favorite DESC, updated_at DESC, id ASC;
