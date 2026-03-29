/**
 * Server-side ArcFace R50 inference (Node.js only — never imported on client).
 *
 * Model: server-models/w600k_r50.onnx  (~85 MB)
 *   – ResNet-50 backbone, ArcFace loss, trained on WebFace600K
 *   – Input : [1, 3, 112, 112] float32, normalised to [-1, 1]
 *   – Output: [1, 512] float32, L2-normalised embedding
 *
 * The session is created once and reused across requests.
 */

import * as ort  from "onnxruntime-node"
import path      from "path"

let session : ort.InferenceSession | null = null
let promise : Promise<ort.InferenceSession> | null = null

async function getSession(): Promise<ort.InferenceSession> {
  if (session)  return session
  if (promise)  return promise

  promise = ort.InferenceSession.create(
    path.join(process.cwd(), "server-models", "w600k_r50.onnx"),
    { executionProviders: ["cpu"] }
  ).then(s => { session = s; return s })

  return promise
}

/**
 * Compute an ArcFace R50 descriptor from a base64-encoded RGBA pixel buffer.
 * The buffer must represent a 112×112 image (112 × 112 × 4 = 50 176 bytes).
 */
export async function computeR50Descriptor(
  rgbaBase64: string
): Promise<Float32Array> {
  const sess = await getSession()
  const buf  = Buffer.from(rgbaBase64, "base64")
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
}
