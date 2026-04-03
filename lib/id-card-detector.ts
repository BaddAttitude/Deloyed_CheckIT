"use client"

/**
 * ID Card Detector — MobileNetV2 binary classifier via ONNX Runtime Web
 *
 * Model: public/models/id-detector/model.onnx
 *   – MobileNetV2 backbone pretrained on ImageNet, fine-tuned on UK DL images
 *   – Input : [1, 3, 224, 224] float32, normalised to [-1, 1]
 *   – Output: [1, 2] float32 logits  [not-card, card]
 *
 * Train the model with:  python train-id-detector.py
 * Then place the output at: public/models/id-detector/model.onnx
 *
 * Falls back to `null` (caller uses heuristic) if model file is not present.
 */

import type { InferenceSession as OrtSession } from "onnxruntime-web"

const MODEL_URL  = "/models/id-detector/model.onnx"
const INPUT_SIZE = 224

let session  : OrtSession | null = null
let promise  : Promise<OrtSession | null> | null = null
let running  = false   // prevents overlapping inference calls

// ── Loader ────────────────────────────────────────────────────────────────────

export async function loadIDCardDetector(): Promise<OrtSession | null> {
  if (session) return session
  if (promise) return promise

  promise = (async () => {
    try {
      const ort = await import("onnxruntime-web")
      ort.env.wasm.wasmPaths = "/ort/"
      session = await ort.InferenceSession.create(MODEL_URL, {
        executionProviders: ["wasm"],
      })
      return session
    } catch {
      // Model not yet trained / not placed — caller falls back to heuristic
      return null
    }
  })()

  return promise
}

export function isIDCardDetectorReady(): boolean {
  return session !== null
}

// ── Inference ─────────────────────────────────────────────────────────────────
// Returns probability 0–1 that the guide region contains an ID card.
// Returns -1 if model is not loaded or inference is already running.

export async function scoreIDCard(
  video : HTMLVideoElement,
  sx    : number,   // guide region in video pixels (x offset)
  sy    : number,   // guide region in video pixels (y offset)
  sw    : number,   // guide region width in video pixels
  sh    : number,   // guide region height in video pixels
): Promise<number> {
  if (!session || running) return -1
  running = true

  try {
    const ort = await import("onnxruntime-web")

    // 1. Draw guide region into a 224×224 offscreen canvas
    const canvas = document.createElement("canvas")
    canvas.width  = INPUT_SIZE
    canvas.height = INPUT_SIZE
    const ctx = canvas.getContext("2d")!
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, INPUT_SIZE, INPUT_SIZE)
    const { data } = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE)

    // 2. Build CHW float32 tensor, normalise to [-1, 1]
    const pixels = INPUT_SIZE * INPUT_SIZE
    const tensor = new Float32Array(3 * pixels)
    for (let i = 0; i < pixels; i++) {
      tensor[i]              = data[i * 4]     / 127.5 - 1   // R
      tensor[pixels + i]     = data[i * 4 + 1] / 127.5 - 1   // G
      tensor[2 * pixels + i] = data[i * 4 + 2] / 127.5 - 1   // B
    }

    // 3. Run model
    const inputName  = session.inputNames[0]
    const ortTensor  = new ort.Tensor("float32", tensor, [1, 3, INPUT_SIZE, INPUT_SIZE])
    const result     = await session.run({ [inputName]: ortTensor })
    const logits     = result[session.outputNames[0]].data as Float32Array

    // 4. Softmax → probability for class 1 (card)
    const e0 = Math.exp(logits[0])
    const e1 = Math.exp(logits[1])
    return e1 / (e0 + e1)
  } catch {
    return -1
  } finally {
    running = false
  }
}
