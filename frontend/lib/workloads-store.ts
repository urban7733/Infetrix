import { Pool } from "pg";
import { ProviderRequest } from "@/lib/infetrix";

export type WorkloadMode = "route" | "infer";
export type WorkloadPolicy = "cost" | "latency" | "balanced";
export type OptimizationProfile = "baseline" | "tuned" | "aggressive";

export type Workload = {
  id: string;
  name: string;
  model: string;
  mode: WorkloadMode;
  policy: WorkloadPolicy;
  optimization_profile: OptimizationProfile;
  optimization_enabled: boolean;
  max_tokens: number;
  temperature: number;
  budget_per_1k?: number;
  latency_sla_ms?: number;
  sample_input?: string;
  providers: ProviderRequest[];
  created_at: string;
  updated_at: string;
};

type WorkloadRow = {
  id: string;
  name: string;
  model: string;
  mode: WorkloadMode;
  policy: WorkloadPolicy;
  optimization_profile: OptimizationProfile;
  optimization_enabled: boolean;
  max_tokens: number;
  temperature: number;
  budget_per_1k: number | null;
  latency_sla_ms: number | null;
  sample_input: string;
  providers: ProviderRequest[];
  created_at: Date | string;
  updated_at: Date | string;
};

declare global {
  var __INFETRIX_WORKLOADS__: Map<string, Workload> | undefined;
  var __INFETRIX_PG_POOL__: Pool | undefined;
  var __INFETRIX_PG_INIT__: Promise<void> | undefined;
}

const memoryStore = globalThis.__INFETRIX_WORKLOADS__ ?? (globalThis.__INFETRIX_WORKLOADS__ = new Map<string, Workload>());

const schemaSQL = `
CREATE TABLE IF NOT EXISTS infetrix_workloads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  model TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('route', 'infer')),
  policy TEXT NOT NULL CHECK (policy IN ('cost', 'latency', 'balanced')),
  optimization_profile TEXT NOT NULL DEFAULT 'baseline' CHECK (optimization_profile IN ('baseline', 'tuned', 'aggressive')),
  optimization_enabled BOOLEAN NOT NULL DEFAULT true,
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
`;

function iso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function mapRow(row: WorkloadRow): Workload {
  return {
    id: row.id,
    name: row.name,
    model: row.model,
    mode: row.mode,
    policy: row.policy,
    optimization_profile: row.optimization_profile ?? "baseline",
    optimization_enabled: row.optimization_enabled ?? true,
    max_tokens: row.max_tokens,
    temperature: row.temperature,
    budget_per_1k: row.budget_per_1k ?? undefined,
    latency_sla_ms: row.latency_sla_ms ?? undefined,
    sample_input: row.sample_input,
    providers: Array.isArray(row.providers) ? row.providers : [],
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
}

function hasDatabaseURL(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim());
}

function shouldUseSSL(url: string): boolean {
  if (process.env.PGSSL === "disable") return false;
  return !url.includes("localhost") && !url.includes("127.0.0.1");
}

async function getPool(): Promise<Pool | null> {
  if (!hasDatabaseURL()) return null;

  if (!globalThis.__INFETRIX_PG_POOL__) {
    const connectionString = String(process.env.DATABASE_URL).trim();
    globalThis.__INFETRIX_PG_POOL__ = new Pool({
      connectionString,
      ssl: shouldUseSSL(connectionString) ? { rejectUnauthorized: false } : false,
      max: 5,
      idleTimeoutMillis: 30_000,
    });
  }

  if (!globalThis.__INFETRIX_PG_INIT__) {
    globalThis.__INFETRIX_PG_INIT__ = globalThis.__INFETRIX_PG_POOL__
      .query(schemaSQL)
      .then(() => undefined);
  }

  await globalThis.__INFETRIX_PG_INIT__;
  return globalThis.__INFETRIX_PG_POOL__;
}

export const workloadStore = {
  async list(): Promise<Workload[]> {
    const pool = await getPool();
    if (!pool) {
      return [...memoryStore.values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    }

    const result = await pool.query<WorkloadRow>(`SELECT * FROM infetrix_workloads ORDER BY updated_at DESC`);
    return result.rows.map(mapRow);
  },

  async get(id: string): Promise<Workload | null> {
    const pool = await getPool();
    if (!pool) {
      return memoryStore.get(id) ?? null;
    }

    const result = await pool.query<WorkloadRow>(`SELECT * FROM infetrix_workloads WHERE id = $1 LIMIT 1`, [id]);
    if (result.rowCount === 0) return null;
    return mapRow(result.rows[0]);
  },

  async create(workload: Workload): Promise<Workload> {
    const pool = await getPool();
    if (!pool) {
      memoryStore.set(workload.id, workload);
      return workload;
    }

    const result = await pool.query<WorkloadRow>(
      `
      INSERT INTO infetrix_workloads (
        id, name, model, mode, policy, optimization_profile, optimization_enabled,
        max_tokens, temperature, budget_per_1k, latency_sla_ms, sample_input,
        providers, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12,
        $13::jsonb, $14::timestamptz, $15::timestamptz
      )
      RETURNING *
      `,
      [
        workload.id,
        workload.name,
        workload.model,
        workload.mode,
        workload.policy,
        workload.optimization_profile ?? "baseline",
        workload.optimization_enabled ?? true,
        workload.max_tokens,
        workload.temperature,
        workload.budget_per_1k ?? null,
        workload.latency_sla_ms ?? null,
        workload.sample_input ?? "",
        JSON.stringify(workload.providers),
        workload.created_at,
        workload.updated_at,
      ],
    );

    return mapRow(result.rows[0]);
  },

  async delete(id: string): Promise<void> {
    const pool = await getPool();
    if (!pool) {
      memoryStore.delete(id);
      return;
    }

    await pool.query(`DELETE FROM infetrix_workloads WHERE id = $1`, [id]);
  },
};
