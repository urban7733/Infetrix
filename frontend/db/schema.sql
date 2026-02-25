CREATE TABLE IF NOT EXISTS infetrix_workloads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  model TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('route', 'infer')),
  policy TEXT NOT NULL CHECK (policy IN ('cost', 'latency', 'balanced')),
  max_tokens INTEGER NOT NULL,
  temperature DOUBLE PRECISION NOT NULL,
  budget_per_1k DOUBLE PRECISION,
  latency_sla_ms INTEGER,
  sample_input TEXT NOT NULL DEFAULT '',
  providers JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS infetrix_workloads_updated_at_idx ON infetrix_workloads (updated_at DESC);
