export type Policy = "cost" | "latency" | "balanced";

export type ProviderRequest = {
  name: string;
  endpoint: string;
  api_key: string;
  price_per_1k_tokens: number;
  avg_latency_ms: number;
  availability: number;
};

export type RouteRequest = {
  prompt?: string;
  model: string;
  policy?: string;
  providers: ProviderRequest[];
};

export type InferRequest = {
  prompt: string;
  model: string;
  policy?: string;
  max_tokens?: number;
  temperature?: number;
  providers: ProviderRequest[];
};

export type RankedProvider = {
  provider: ProviderRequest;
  cost_score: number;
  latency_score: number;
  availability_score: number;
  total_score: number;
};

const dispatchHostAllowlist: Record<string, string[]> = {
  runpod: ["runpod.ai"],
  huggingface: ["huggingface.co"],
  hugging_face: ["huggingface.co"],
  hf: ["huggingface.co"],
};

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function normalizeInverse(value: number, min: number, max: number): number {
  if (max === min) return 1;
  return (max - value) / (max - min);
}

function normalizeDirect(value: number, min: number, max: number): number {
  if (max === min) return 1;
  return (value - min) / (max - min);
}

function weightsFor(policy: Policy): [number, number, number] {
  if (policy === "cost") return [0.7, 0.2, 0.1];
  if (policy === "latency") return [0.2, 0.7, 0.1];
  return [0.45, 0.35, 0.2];
}

export function parsePolicy(raw: string | undefined, fallback: Policy = "balanced"): Policy {
  const value = (raw || fallback).trim().toLowerCase();
  if (value === "cost" || value === "latency" || value === "balanced") return value;
  throw new Error(`unsupported policy: \"${raw}\"`);
}

export function apiKeyPreview(key: string): string {
  const value = (key || "").trim();
  if (!value) return "";
  if (value.length <= 6) return "***";
  return `${value.slice(0, 3)}...${value.slice(-2)}`;
}

export function validateProviderInput(providers: ProviderRequest[], requireSecrets: boolean): void {
  if (!Array.isArray(providers) || providers.length === 0) {
    throw new Error("at least one provider is required");
  }

  for (const provider of providers) {
    if (!provider.name || !provider.name.trim()) {
      throw new Error("provider name is required");
    }
    if (!provider.endpoint || !provider.endpoint.trim()) {
      throw new Error("provider endpoint is required");
    }
    if (requireSecrets && (!provider.api_key || !provider.api_key.trim())) {
      throw new Error("provider api_key is required");
    }
    if (provider.price_per_1k_tokens < 0) {
      throw new Error(`provider \"${provider.name}\" has negative price_per_1k_tokens`);
    }
    if (provider.avg_latency_ms < 0) {
      throw new Error(`provider \"${provider.name}\" has negative avg_latency_ms`);
    }
    if (provider.availability < 0 || provider.availability > 1) {
      throw new Error(`provider \"${provider.name}\" availability must be between 0 and 1`);
    }
  }
}

function isLoopbackHost(host: string): boolean {
  const value = host.trim().toLowerCase();
  if (!value) return false;
  if (value === "localhost" || value === "::1") return true;
  if (value.startsWith("127.")) return true;
  return false;
}

export function validateDispatchEndpoint(providerName: string, endpoint: string): void {
  let parsed: URL;
  try {
    parsed = new URL(endpoint.trim());
  } catch {
    throw new Error("provider endpoint must be a valid URL");
  }

  const protocol = parsed.protocol.toLowerCase();
  const host = parsed.hostname.trim().toLowerCase();
  if (!host) {
    throw new Error("provider endpoint must include a host");
  }
  if (protocol !== "http:" && protocol !== "https:") {
    throw new Error("provider endpoint must use http or https");
  }
  if (isLoopbackHost(host)) {
    return;
  }
  if (protocol !== "https:") {
    throw new Error("provider endpoint must use https");
  }

  const allowlist = dispatchHostAllowlist[providerName.trim().toLowerCase()] || [];
  if (allowlist.length === 0) {
    throw new Error(`no adapter for provider \"${providerName}\"`);
  }

  const validHost = allowlist.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
  if (!validHost) {
    throw new Error(`provider endpoint host \"${host}\" is not allowed for \"${providerName}\"`);
  }
}

export function rankProviders(policy: Policy, providers: ProviderRequest[]): RankedProvider[] {
  validateProviderInput(providers, false);

  const minPrice = Math.min(...providers.map((provider) => provider.price_per_1k_tokens));
  const maxPrice = Math.max(...providers.map((provider) => provider.price_per_1k_tokens));
  const minLatency = Math.min(...providers.map((provider) => provider.avg_latency_ms));
  const maxLatency = Math.max(...providers.map((provider) => provider.avg_latency_ms));
  const minAvail = Math.min(...providers.map((provider) => provider.availability));
  const maxAvail = Math.max(...providers.map((provider) => provider.availability));

  const [costW, latencyW, availW] = weightsFor(policy);

  const rankings = providers.map((provider) => {
    const cost = normalizeInverse(provider.price_per_1k_tokens, minPrice, maxPrice);
    const latency = normalizeInverse(provider.avg_latency_ms, minLatency, maxLatency);
    const availability = normalizeDirect(provider.availability, minAvail, maxAvail);
    const total = cost * costW + latency * latencyW + availability * availW;

    return {
      provider,
      cost_score: round4(cost),
      latency_score: round4(latency),
      availability_score: round4(availability),
      total_score: round4(total),
    };
  });

  rankings.sort((a, b) => {
    if (a.total_score === b.total_score) {
      if (a.provider.availability === b.provider.availability) {
        return a.provider.name.localeCompare(b.provider.name);
      }
      return b.provider.availability - a.provider.availability;
    }
    return b.total_score - a.total_score;
  });

  return rankings;
}

export function requestID(): string {
  const now = new Date();
  const iso = now.toISOString().replace(/[-:]/g, "").replace("T", "T").replace("Z", "");
  return `req_${iso}`;
}
