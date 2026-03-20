import { NextResponse } from "next/server";
import { benchmarkCatalog, benchmarkCatalogSummary } from "@/lib/benchmark-catalog";

export async function GET() {
  const summary = benchmarkCatalogSummary();

  return NextResponse.json({
    ...summary,
    runs: benchmarkCatalog.runs,
  });
}
