-- Small key/value settings the server keeps for itself (e.g. which seed password the seeded accounts have).
CREATE TABLE IF NOT EXISTS app_meta (
  key         text PRIMARY KEY,
  value       text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
