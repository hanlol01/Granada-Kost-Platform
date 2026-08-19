DO $$
BEGIN
  IF to_regclass('public.complaints') IS NULL
     OR to_regclass('public.maintenance_work_orders') IS NULL
     OR to_regclass('public.business_events') IS NULL THEN
    RAISE EXCEPTION 'W09B requires complaints, maintenance_work_orders, and business_events';
  END IF;
END $$;

-- A complaint may have only one actionable work order at a time.  Dispatch
-- already serializes on the complaint advisory lock; this index is the final
-- database guard for every other write path.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM maintenance_work_orders
    WHERE complaint_id IS NOT NULL
      AND work_order_status IN ('open', 'assigned', 'in_progress', 'on_hold', 'completed', 'rework_required')
    GROUP BY complaint_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'W09B cannot install actionable work-order uniqueness while duplicate data exists';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_maintenance_work_orders_actionable_complaint
  ON maintenance_work_orders(complaint_id)
  WHERE complaint_id IS NOT NULL
    AND work_order_status IN ('open', 'assigned', 'in_progress', 'on_hold', 'completed', 'rework_required');

CREATE INDEX IF NOT EXISTS idx_complaint_status_history_actor
  ON complaint_status_histories(complaint_id, changed_at DESC, changed_by_user_id);

CREATE INDEX IF NOT EXISTS idx_work_order_status_history_actor
  ON maintenance_work_order_histories(work_order_id, changed_at DESC, changed_by_user_id);

CREATE INDEX IF NOT EXISTS idx_w09b_business_events_aggregate
  ON business_events(aggregate_type, aggregate_id, created_at DESC)
  WHERE event_type IN ('complaint.status_changed', 'work_order.status_changed');
