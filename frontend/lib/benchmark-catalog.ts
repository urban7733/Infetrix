import catalog from "@/data/benchmark-catalog.json";

export type BenchmarkCatalogRun = {
  id: string;
  lane: string;
  hardware: string;
  runtime: string;
  scenario: string;
  model_family: string;
  mojo_path: string;
  ttft_ms: number;
  decode_tokens_per_second: number;
  blended_cost_per_1k: number;
  quality_score: number;
  lock_in_score: number;
};

export type BenchmarkCatalog = {
  version: string;
  source: string;
  runs: BenchmarkCatalogRun[];
};

export const benchmarkCatalog = catalog as BenchmarkCatalog;

export function benchmarkCatalogSummary() {
  return {
    version: benchmarkCatalog.version,
    source: benchmarkCatalog.source,
    run_count: benchmarkCatalog.runs.length,
  };
}
