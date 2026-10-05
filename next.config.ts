import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Overridable so the Playwright dev server can run next to `npm run dev` (see tech-docs/testing.md).
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default nextConfig;
