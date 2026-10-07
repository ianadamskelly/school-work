import type { NextConfig } from "next";

// Disposable browser fixtures use shared dependencies and do not package Docker
// output. The real standalone configuration is validated by the repository build.
const config: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
};
export default config;
