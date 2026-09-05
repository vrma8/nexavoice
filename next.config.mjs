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
  webpack: (config, { dev }) => {
    if (dev) {
      // The local PGlite dev database (`pnpm dev:db`) rewrites .data/pglite on
      // every commit. Without this the dev watcher sees "file changes" after
      // each API write, recompiles routes mid-request and sporadically answers
      // 500 ("Manifest file is empty" / "Unexpected end of JSON input").
      config.watchOptions = {
        ...config.watchOptions,
        ignored: ['**/node_modules/**', '**/.git/**', '**/.next/**', '**/.data/**'],
      };
    }
    return config;
  },
  experimental: {
    // `parallelServerCompiles` / `webpackBuildWorker` race the dev route loader:
    // under a burst of API requests a recompile can serve an unfinished chunk and
    // the route answers 500 "Manifest file is empty" / "Unexpected end of JSON
    // input". Keep parallel work for production builds only, where output is
    // written once and never read mid-flight.
    webpackBuildWorker: process.env.NODE_ENV === 'production',
    parallelServerBuildTraces: true,
    parallelServerCompiles: process.env.NODE_ENV === 'production',
  },
};

export default nextConfig;
