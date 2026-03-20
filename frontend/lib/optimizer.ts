/**
 * Mojo/MAX Optimization Client
 * Handles optimization profile configuration for inference requests
 */

export type OptimizationProfile = "baseline" | "tuned" | "aggressive";

export type OptimizationConfig = {
  quantization: string | null;
  batch_strategy: "standard" | "in_flight";
  chunked_prefill: boolean;
  device_memory_utilization: number;
  speculative_decoding: boolean;
};

export type OptimizeRequest = {
  profile: OptimizationProfile;
  model: string;
  prompt: string;
  max_tokens?: number;
  temperature?: number;
};

export type OptimizeResponse = {
  profile: OptimizationProfile;
  config: OptimizationConfig;
  projected_savings_pct: number;
  projected_latency_reduction_pct: number;
};

export type MaxDeploymentPlanRequest = {
  model: string;
  model_path: string;
  profile: OptimizationProfile;
  port?: number;
};

export type MaxDeploymentPlan = OptimizeResponse & {
  model: string;
  model_path: string;
  port: number;
  runtime: "max";
  env: Record<string, string>;
  commands: {
    serve: string;
    warm_cache: string;
    baseline_benchmark: string;
    optimized_benchmark: string;
    compare: string;
  };
  notes: string[];
};

// Profile configurations based on mojo-max-playbook.md
const PROFILE_CONFIGS: Record<OptimizationProfile, OptimizationConfig> = {
  baseline: {
    quantization: null,
    batch_strategy: "standard",
    chunked_prefill: false,
    device_memory_utilization: 0.85,
    speculative_decoding: false,
  },
  tuned: {
    quantization: "Q4_K",
    batch_strategy: "in_flight",
    chunked_prefill: true,
    device_memory_utilization: 0.92,
    speculative_decoding: false,
  },
  aggressive: {
    quantization: "Q4_K",
    batch_strategy: "in_flight",
    chunked_prefill: true,
    device_memory_utilization: 0.95,
    speculative_decoding: true,
  },
};

const PROFILE_SAVINGS: Record<OptimizationProfile, { cost: number; latency: number }> = {
  baseline: { cost: 0, latency: 0 },
  tuned: { cost: 30, latency: 15 },
  aggressive: { cost: 40, latency: 25 },
};

function pickPort(value: number | undefined): number {
  if (!Number.isFinite(value) || Number(value) <= 0) return 8000;
  return Math.floor(Number(value));
}

function buildServeCommand(profile: OptimizationProfile, config: OptimizationConfig): string {
  const args = [
    "max serve",
    '  --model-path "$MODEL_PATH"',
    '  --port "$PORT"',
    "  --batch-timeout 0",
    "  --max-num-steps 10",
    `  --device-memory-utilization ${config.device_memory_utilization.toFixed(2)}`,
  ];

  if (profile !== "baseline") {
    args.push("  --enable-in-flight-batching");
  }

  return args.join(" \\\n");
}

function buildOptimizedBenchmarkCommand(profile: OptimizationProfile): string {
  const args = [
    "max benchmark",
    '  --model "$MODEL_PATH"',
    "  --dataset-name sharegpt",
    "  --num-prompts 200",
  ];

  if (profile !== "baseline") {
    args.push("  --enable-in-flight-batching");
  }

  args.push(`  --output-file "./benchmarks/${profile}.json"`);
  return args.join(" \\\n");
}

export function buildMaxDeploymentPlan(request: MaxDeploymentPlanRequest): MaxDeploymentPlan {
  const model = request.model.trim();
  const model_path = request.model_path.trim();
  if (!model) {
    throw new Error("model is required");
  }
  if (!model_path) {
    throw new Error("model_path is required");
  }

  const profile = request.profile;
  const port = pickPort(request.port);
  const optimized = optimize({
    profile,
    model,
    prompt: "",
  });

  const env = {
    MODEL_ID: model,
    MODEL_PATH: model_path,
    PORT: String(port),
  };

  const notes = [
    "Run the same MAX deployment plan on a local GPU box, a RunPod pod, or a Modal container.",
    "Prefix caching stays enabled by default in MAX Serve; use repeated prompt prefixes to capture the savings.",
    "You do not need provider API keys in the inference request path when you host the optimized runtime yourself.",
  ];

  if (profile === "tuned") {
    notes.push("Tuned is the safest default: quantization + in-flight batching without speculative decoding.");
  }

  if (profile === "aggressive") {
    notes.push("Aggressive should stay behind a feature flag until speculative decoding is validated for your workload.");
  }

  return {
    ...optimized,
    model,
    model_path,
    port,
    runtime: "max",
    env,
    commands: {
      serve: buildServeCommand(profile, optimized.config),
      warm_cache: 'max warm-cache --model-path "$MODEL_PATH"',
      baseline_benchmark: [
        "max benchmark",
        '  --model "$MODEL_PATH"',
        "  --dataset-name sharegpt",
        "  --num-prompts 200",
        '  --output-file "./benchmarks/baseline.json"',
      ].join(" \\\n"),
      optimized_benchmark: buildOptimizedBenchmarkCommand(profile),
      compare: `python3 scripts/max/compare.py ./benchmarks/baseline.json ./benchmarks/${profile}.json`,
    },
    notes,
  };
}

/**
 * Get optimization configuration for a given profile
 * This is the local implementation - no external sidecar required for basic profiles
 */
export function getOptimizationConfig(profile: OptimizationProfile): OptimizationConfig {
  return PROFILE_CONFIGS[profile] ?? PROFILE_CONFIGS.baseline;
}

/**
 * Apply optimization to a request
 * Returns the optimized configuration and projected savings
 */
export function optimize(request: OptimizeRequest): OptimizeResponse {
  const config = getOptimizationConfig(request.profile);
  const savings = PROFILE_SAVINGS[request.profile] ?? PROFILE_SAVINGS.baseline;

  return {
    profile: request.profile,
    config,
    projected_savings_pct: savings.cost,
    projected_latency_reduction_pct: savings.latency,
  };
}

/**
 * Check if optimization should be applied for a workload
 */
export function shouldOptimize(profile: OptimizationProfile, enabled: boolean): boolean {
  return enabled && profile !== "baseline";
}

/**
 * Get human-readable description for a profile
 */
export function getProfileDescription(profile: OptimizationProfile): string {
  switch (profile) {
    case "baseline":
      return "Standard inference with prefix caching. No aggressive optimizations.";
    case "tuned":
      return "Quantized model (Q4_K) + in-flight batching + chunked prefill. ~30% cost reduction.";
    case "aggressive":
      return "Tuned profile + speculative decoding. Maximum optimization (~40% savings).";
    default:
      return "Unknown profile";
  }
}

/**
 * Validate that a string is a valid optimization profile
 */
export function isValidProfile(value: string): value is OptimizationProfile {
  return value === "baseline" || value === "tuned" || value === "aggressive";
}

/**
 * Parse a profile string with fallback to baseline
 */
export function parseProfile(value: string | undefined | null): OptimizationProfile {
  if (!value) return "baseline";
  const normalized = value.trim().toLowerCase();
  return isValidProfile(normalized) ? normalized : "baseline";
}
