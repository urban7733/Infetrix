-- Optional extension for future semantic routing / retrieval use-cases.
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE infetrix_workloads
ADD COLUMN IF NOT EXISTS routing_embedding vector(1536);

CREATE INDEX IF NOT EXISTS infetrix_workloads_routing_embedding_idx
ON infetrix_workloads
USING ivfflat (routing_embedding vector_cosine_ops)
WITH (lists = 100);
