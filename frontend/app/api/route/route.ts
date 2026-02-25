import { NextResponse } from "next/server";

const API_BASE = process.env.INFETRIX_API_BASE || "http://127.0.0.1:8080";

export async function POST(request: Request) {
  try {
    const payload = await request.text();
    const upstream = await fetch(`${API_BASE}/v1/route`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
      cache: "no-store",
    });

    const text = await upstream.text();
    let data: unknown = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    return NextResponse.json(data, { status: upstream.status });
  } catch (error) {
    return NextResponse.json(
      {
        error: "proxy route failed",
        detail: error instanceof Error ? error.message : "unknown error",
      },
      { status: 502 },
    );
  }
}
