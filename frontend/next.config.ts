import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /** Monorepo: trace files from repo root so serverless bundles resolve `frontend` deps correctly on Vercel. */
  outputFileTracingRoot: path.join(__dirname, ".."),
  serverExternalPackages: ["pg"],
};

export default nextConfig;
