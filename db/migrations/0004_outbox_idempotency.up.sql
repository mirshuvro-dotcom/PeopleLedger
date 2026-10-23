-- phase: expand
-- owner: platform
-- requirements: ARCH-07, GOV-02
--
-- Transactional outbox and idempotency keys. Events are written in the same
-- transaction as the business change; delivery is at least once; handlers are
-- made effectively-once by recording an idempotency key in the transaction that
-- applies their effect.

CREATE TABLE outbox_event (
  tenant_id      uuid NOT NULL DEFAULT app_current_tenant() REFERENCES tenant (id),
  id             uuid NOT NULL DEFAULT gen_random_uuid(),
  topic          text NOT NULL CHECK (topic ~ '^[a-z][a-z0-9_.-]{2,99}$'),
  dedupe_key     text NOT NULL CHECK (length(dedupe_key) BETWEEN 1 AND 200),
  payload        jsonb NOT NULL,
  correlation_id text NOT NULL CHECK (length(correlation_id) BETWEEN 1 AND 200),
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'dead')),
  attempts       integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
  locked_by      text,
  locked_until   timestamptz,
  last_error     text CHECK (last_error IS NULL OR length(last_error) <= 1000),
  created_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  processed_at   timestamptz,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, topic, dedupe_key),
  CHECK ((status = 'processing') = (locked_by IS NOT NULL AND locked_until IS NOT NULL)),
  CHECK ((status = 'done') = (processed_at IS NOT NULL))
);
CREATE INDEX outbox_event_ready ON outbox_event (available_at, created_at) WHERE status IN ('pending', 'processing');

-- GOV-02 state contract: docs/architecture/workflows/outbox-event.md
CREATE FUNCTION outbox_event_transition() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.tenant_id, OLD.id, OLD.topic, OLD.dedupe_key, OLD.payload, OLD.correlation_id, OLD.created_at)
     IS DISTINCT FROM (NEW.tenant_id, NEW.id, NEW.topic, NEW.dedupe_key, NEW.payload, NEW.correlation_id, NEW.created_at) THEN
    RAISE EXCEPTION 'outbox event content is immutable' USING ERRCODE = 'PL005';
  END IF;
  IF OLD.status = NEW.status AND NEW.status <> 'processing' THEN
    RETURN NEW;
  END IF;
  IF (OLD.status, NEW.status) NOT IN (
    ('pending', 'processing'), ('processing', 'processing'),
    ('processing', 'done'), ('processing', 'pending'), ('processing', 'dead')
  ) THEN
    RAISE EXCEPTION 'outbox transition % -> % is not allowed', OLD.status, NEW.status USING ERRCODE = 'PL003';
  END IF;
  -- Re-claiming a processing event is only allowed once its lease expired.
  IF OLD.status = 'processing' AND NEW.status = 'processing' AND OLD.locked_until >= clock_timestamp() THEN
    RAISE EXCEPTION 'outbox event is leased until %', OLD.locked_until USING ERRCODE = 'PL003';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER outbox_event_transition BEFORE UPDATE ON outbox_event FOR EACH ROW EXECUTE FUNCTION outbox_event_transition();

SELECT app_enable_tenant_rls('outbox_event');
GRANT SELECT ON outbox_event TO pl_app;
GRANT INSERT (tenant_id, id, topic, dedupe_key, payload, correlation_id, available_at) ON outbox_event TO pl_app;
GRANT UPDATE (status, attempts, available_at, locked_by, locked_until, last_error, processed_at) ON outbox_event TO pl_worker;

-- Cross-tenant claim for workers. Returns identifiers only; the worker then
-- reads the payload and applies effects inside that event's tenant context.
CREATE FUNCTION outbox_claim(p_worker text, p_limit integer, p_lease_seconds integer)
RETURNS TABLE (tenant_id uuid, id uuid, topic text, attempts integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
#variable_conflict use_column
BEGIN
  IF p_worker IS NULL OR length(p_worker) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'worker id required' USING ERRCODE = '22023';
  END IF;
  IF p_limit NOT BETWEEN 1 AND 500 OR p_lease_seconds NOT BETWEEN 1 AND 3600 THEN
    RAISE EXCEPTION 'claim limit 1..500 and lease 1..3600 seconds' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  WITH ready AS (
    SELECT o.tenant_id, o.id
    FROM outbox_event o
    WHERE (o.status = 'pending' AND o.available_at <= clock_timestamp())
       OR (o.status = 'processing' AND o.locked_until < clock_timestamp())
    ORDER BY o.available_at, o.created_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE outbox_event o
  SET status = 'processing',
      locked_by = p_worker,
      locked_until = clock_timestamp() + make_interval(secs => p_lease_seconds),
      attempts = o.attempts + 1
  FROM ready
  WHERE o.tenant_id = ready.tenant_id AND o.id = ready.id
  RETURNING o.tenant_id, o.id, o.topic, o.attempts;
END
$$;
REVOKE ALL ON FUNCTION outbox_claim(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION outbox_claim(text, integer, integer) TO pl_worker;

CREATE TABLE idempotency_key (
  tenant_id  uuid NOT NULL DEFAULT app_current_tenant() REFERENCES tenant (id),
  scope      text NOT NULL CHECK (scope ~ '^[a-z][a-z0-9_.:-]{2,99}$'),
  key        text NOT NULL CHECK (length(key) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, scope, key)
);
SELECT app_enable_tenant_rls('idempotency_key');
GRANT SELECT ON idempotency_key TO pl_app;
GRANT INSERT (tenant_id, scope, key) ON idempotency_key TO pl_app;
