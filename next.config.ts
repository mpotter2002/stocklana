import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // AGENTS.md and the README use http://127.0.0.1 for local browser testing.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
