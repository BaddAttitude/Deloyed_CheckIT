"use client"

/**
 * Client-side ArcFace R50 loader.
 *
 * Model: public/models/w600k_r50.onnx  (~85 MB)
 *   – ResNet-50 backbone, ArcFace loss, trained on WebFace600K
 *   – Input : [1, 3, 112, 112] float32, normalised to [-1, 1]
 *   – Output: [1, 512] float32, L2-normalised embedding
 *
 * Loaded lazily — only fetched the first time an ambiguous case (0.25–0.75)
 * is encountered. The browser caches it after the first download.
 *
 * Falls back silently (returns null) if loading or inference fails so the
 * caller can fall back to the MobileFaceNet result.
 */

import type { InferenceSession as OrtSession } from "onnxruntime-web"

let session : OrtSession | null = null
let promise : Promise<OrtSession | null> | null = null

async function getSession(): Promise<OrtSession | null> {
  if (session)  return session
  if (promise)  return promise

  promise = (async () => {
    try {
      const ort = await import("onnxruntime-web")
      ort.env.wasm.wasmPaths = "/ort/"

      const sess = await ort.InferenceSession.create("/models/w600k_r50.onnx", {
        executionProviders: ["webgl", "wasm"],
      })
      session = sess
      return sess
    } catch {
      // Low-end device or model unavailable — caller falls back to MBF result
      return null
    }
  })()

  return promise
}

/**
 * Compute an ArcFace R50 descriptor from a base64-encoded RGBA pixel buffer.
 * The buffer must represent a 112×112 image (112 × 112 × 4 = 50 176 bytes).
 *
 * Returns null if the model is unavailable (caller should use MBF distance).
 */
export async function computeR50DescriptorClient(
  rgbaBase64: string
): Promise<Float32Array | null> {
  const sess = await getSession()
  if (!sess) return null

  try {
    const ort = await import("onnxruntime-web")
    const buf  = Uint8Array.from(atob(rgbaBase64), c => c.charCodeAt(0))
    const hw   = 112 * 112
    const data = new Float32Array(3 * hw)

    for (let i = 0; i < hw; i++) {
      data[i]          = (buf[i * 4]     - 127.5) / 127.5  // R
      data[hw + i]     = (buf[i * 4 + 1] - 127.5) / 127.5  // G
      data[hw * 2 + i] = (buf[i * 4 + 2] - 127.5) / 127.5  // B
    }

    const tensor = new ort.Tensor("float32", data, [1, 3, 112, 112])
    const out    = await sess.run({ [sess.inputNames[0]]: tensor })
    return new Float32Array(out[sess.outputNames[0]].data as Float32Array)
  } catch {
    return null
  }
}
