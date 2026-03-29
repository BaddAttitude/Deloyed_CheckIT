"use client"

// face-api.js models are no longer needed:
// – Detection  → MediaPipe FaceLandmarker
// – Recognition → ArcFace MobileFaceNet (arcface-loader.ts)
export async function loadFaceApiModels(): Promise<void> {
  // no-op — kept so existing call-sites compile without changes
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function detectFaceDescriptor(
  _imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement
): Promise<Float32Array | null> {
  return null
}

/**
 * Cosine distance between two ArcFace L2-normalised 512-d vectors.
 *
 * ArcFace outputs unit vectors, so cosine similarity = dot product.
 * Returning (1 - cosine) gives a distance in [0, 2]:
 *   0    = identical
 *   ~0.5 = same person, ID photo vs live (cross-domain)
 *   ~0.8 = different people
 *
 * This maps cleanly to the existing matchPct formula:
 *   matchPct = (1 - distance) × 100
 *   → cosine 0.7 = matchPct 70% = green
 */
export function compareFaceDescriptors(
  a: Float32Array,
  b: Float32Array
): number {
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
  return 1 - dot
}

/**
 * Element-wise mean of multiple ArcFace descriptors, re-normalised back
 * onto the unit sphere.  Averaging without re-normalisation inflates
 * distances — the L2 norm step fixes this.
 */
export function averageDescriptors(descriptors: Float32Array[]): Float32Array {
  const len    = descriptors[0].length
  const result = new Float32Array(len)
  for (const d of descriptors) {
    for (let i = 0; i < len; i++) result[i] += d[i]
  }
  for (let i = 0; i < len; i++) result[i] /= descriptors.length

  // Re-normalise to unit sphere
  const norm = Math.sqrt(result.reduce((s, v) => s + v * v, 0))
  if (norm > 0) for (let i = 0; i < len; i++) result[i] /= norm

  return result
}

// averageDescriptors() normalises onto the unit sphere before comparison.
// Cosine distance < 0.4 → cosine similarity > 0.6 → matchPct > 60%.
export const MATCH_THRESHOLD = 0.4
