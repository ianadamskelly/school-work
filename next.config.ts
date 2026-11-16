import type { NextConfig } from "next";
const nextConfig: NextConfig = {
 output:'standalone',
 turbopack:{resolveAlias:process.env.WORK_JOURNAL_TARGET==='vps'?{'work-journal-runtime':'./lib/node-env.ts'}:{}},
};
export default nextConfig;
