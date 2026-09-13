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
  allowedDevOrigins: ['*.e2b.app', '*.app.github.dev', '*.ngrok-free.app'],
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: ['**/node_modules/**', '**/.git/**', '**/.next/**', '**/.data/**'],
      };
    }
    return config;
  },
  experimental: {
    webpackBuildWorker: process.env.NODE_ENV === 'production',
    parallelServerBuildTraces: true,
    parallelServerCompiles: process.env.NODE_ENV === 'production',
  },
};

export default nextConfig;

