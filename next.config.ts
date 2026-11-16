import type { NextConfig } from "next";
const nextConfig: NextConfig = {
 output:'standalone',
 turbopack:{resolveAlias:{'work-journal-runtime':'./lib/node-env.ts'}},
};
export default nextConfig;
