-- Reverses 0004_outbox_idempotency. Destructive: undelivered events are lost.
DROP TABLE IF EXISTS idempotency_key;
DROP FUNCTION IF EXISTS outbox_claim(text, integer, integer);
DROP TABLE IF EXISTS outbox_event;
DROP FUNCTION IF EXISTS outbox_event_transition();
