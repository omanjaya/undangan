-- MVP single-owner aggregate storage. Row locking makes draft/version/publish and RSVP changes atomic.
-- Payload holds invitation, immutable revisions, opaque session hashes, RSVPs, moderated wishes.
-- A normalized multi-workspace schema is deferred until account onboarding is implemented.
CREATE TABLE IF NOT EXISTS app_state (
  id text PRIMARY KEY CHECK (id = 'primary'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
