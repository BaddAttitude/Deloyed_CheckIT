import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  turbopack: {},

  // @mediapipe/tasks-vision is browser-only (WASM).
  // Tell the bundler not to try resolving it on the server side.
  serverExternalPackages: ["@mediapipe/tasks-vision", "onnxruntime-web", "onnxruntime-node"],

  // COOP + COEP headers required for SharedArrayBuffer (WASM threading).
  // Without these, ONNX Runtime Web falls back to single-threaded WASM
  // and MediaPipe GPU delegate may fail on iOS/Android browsers.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Cross-Origin-Opener-Policy",   value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy",  value: "require-corp" },
        ],
      },
    ]
  },
}

export default nextConfig
