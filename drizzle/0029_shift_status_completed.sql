-- Scheduling status rework (point 4): the UI now surfaces Planning(draft) /
-- Assigned / Completed / Cancelled (+ the Off-day type). `published`/`approved`
-- are kept as legacy enum values (existing rows) and displayed as "completed".
-- Additive / idempotent — only adds the new `completed` value to the enum.

ALTER TYPE "shift_status" ADD VALUE IF NOT EXISTS 'completed';
