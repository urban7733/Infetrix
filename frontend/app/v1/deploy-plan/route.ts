import { NextResponse } from "next/server";
import { buildMaxDeploymentPlan, parseProfile } from "@/lib/optimizer";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      model?: string;
      model_path?: string;
      profile?: string;
      port?: number;
    };

    const model = String(body.model || "").trim();
    const model_path = String(body.model_path || "").trim();
    if (!model) {
      return NextResponse.json({ error: "model is required" }, { status: 400 });
    }
    if (!model_path) {
      return NextResponse.json({ error: "model_path is required" }, { status: 400 });
    }

    const plan = buildMaxDeploymentPlan({
      model,
      model_path,
      profile: parseProfile(body.profile),
      port: body.port,
    });

    return NextResponse.json(plan);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "invalid request body",
      },
      { status: 400 },
    );
  }
}
