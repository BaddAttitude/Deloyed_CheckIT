"use client"

/**
 * Singleton loader for the InsightFace MobileFaceNet ArcFace model.
 *
 * Model: w600k_mbf.onnx  (~4.3 MB)
 *   – MobileFaceNet architecture
 *   – Trained on WebFace600K with ArcFace loss
 *   – Input : [1, 3, 112, 112] float32, normalised to [-1, 1]
 *   – Output: [1, 512] float32, L2-normalised embedding
 *
 * WASM runtime files are served from /ort/ (copied by download-arcface.mjs).
 */

import type { InferenceSession as OrtSession } from "onnxruntime-web"

let session : OrtSession | null = null
let promise : Promise<OrtSession> | null = null

async function getSession(): Promise<OrtSession> {
  if (session)  return session
  if (promise)  return promise

  promise = (async () => {
    // Dynamic import keeps onnxruntime-web out of the SSR bundle
    const ort = await import("onnxruntime-web")

    // Serve WASM runtime files from public/ort/
    ort.env.wasm.wasmPaths = "/ort/"

    const sess = await ort.InferenceSession.create("/models/w600k_mbf.onnx", {
      executionProviders: ["wasm"],
    })
    session = sess
    return sess
  })()

  return promise
}

/**
 * Run ArcFace inference on a pre-aligned 112×112 canvas.
 * Returns a 512-d L2-normalised Float32Array descriptor.
 */
export async function computeArcFaceDescriptor(
  aligned: HTMLCanvasElement
): Promise<Float32Array> {
  const sess = await getSession()
  const ort  = await import("onnxruntime-web")

  const ctx = aligned.getContext("2d")
  if (!ctx) throw new Error("canvas 2d context unavailable")

  const { data } = ctx.getImageData(0, 0, 112, 112)
  const hw    = 112 * 112
  const input = new Float32Array(3 * hw)

  // RGBA → RGB planar (NCHW), normalise to [-1, 1]
  for (let i = 0; i < hw; i++) {
    input[i]          = (data[i * 4]     - 127.5) / 127.5   // R
    input[hw + i]     = (data[i * 4 + 1] - 127.5) / 127.5   // G
    input[hw * 2 + i] = (data[i * 4 + 2] - 127.5) / 127.5   // B
  }

  const tensor = new ort.Tensor("float32", input, [1, 3, 112, 112])
  const feeds: Record<string, typeof tensor> = { [sess.inputNames[0]]: tensor }
  const out = await sess.run(feeds)
  // Return a plain copy — averageDescriptors() re-normalises the result
  // onto the unit sphere before any distance comparison is made.
  return new Float32Array(out[sess.outputNames[0]].data as Float32Array)
}

/** Preload the model — call this at app startup alongside loadFaceLandmarker. */
export async function loadArcFaceModel(): Promise<void> {
  await getSession()
}
