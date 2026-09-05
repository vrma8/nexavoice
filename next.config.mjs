import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  turbopack: {
    root: rootDir,
  },
  // Dev-only: allow the HMR/server-action requests that arrive through a public
  // preview host (Codespaces, e2b, ngrok, Vercel preview tunnels…).
  allowedDevOrigins: ['*.e2b.app', '*.app.github.dev', '*.ngrok-free.app'],
  experimental: {
    webpackBuildWorker: true,
    parallelServerBuildTraces: true,
    parallelServerCompiles: true,
  },
};

export default nextConfig;
