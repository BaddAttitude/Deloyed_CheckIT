import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  turbopack: {},

  allowedDevOrigins: ['allowing-county-asks-drilling.trycloudflare.com'],

  // @mediapipe/tasks-vision is browser-only (WASM).
  // Tell the bundler not to try resolving it on the server side.
  serverExternalPackages: ["@mediapipe/tasks-vision", "onnxruntime-web", "onnxruntime-node"],

  // COOP + COEP headers enable SharedArrayBuffer for WASM threading,
  // but break iOS Safari when accessed via Cloudflare tunnel during local testing.
  // Re-enable these for production deployment where HTTPS is native.
  // async headers() { ... }
}

export default nextConfig
