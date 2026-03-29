"use client"

import { computeArcFaceDescriptor } from "./arcface-loader"

interface Lm { x: number; y: number; z: number }

export interface DescriptorResult {
  descriptor : Float32Array
  /** Base64-encoded RGBA pixel buffer (112×112×4 bytes).
   *  Sent to /api/face-match for server-side R50 re-inference
   *  when the client MobileFaceNet result is ambiguous. */
  cropPixels : string
}

/**
 * Compute a 512-d ArcFace descriptor using MediaPipe iris landmarks
 * for alignment — bypassing face-api.js and SSD entirely.
 *
 * Alignment: iris centres (MediaPipe landmarks 468 & 473) are mapped to
 * ArcFace's canonical 112×112 eye positions:
 *   left  eye ≈ (38.29, 51.70)
 *   right eye ≈ (73.53, 51.50)
 *   eye distance ≈ 35.24 px
 *
 * The same alignment is used for both ID scan and live scan so descriptors
 * are always in the same embedding space.
 *
 * Preprocessing applied before ArcFace inference:
 *   – Histogram equalisation (per-channel) removes contouring / lighting bias
 *   – Colour is preserved (ArcFace was trained on colour images)
 *
 * @param video  HTMLVideoElement that is currently playing
 * @param lms    478 MediaPipe normalised landmarks (refine_landmarks=true)
 * @returns      DescriptorResult with 512-d descriptor + raw crop pixels, or null
 */
export async function computeDescriptorFromLandmarks(
  video : HTMLVideoElement,
  lms   : Lm[]
): Promise<DescriptorResult | null> {
  // Iris landmarks at 468 / 473 — only present with the full 478-pt model
  if (lms.length < 474) return null

  const vW = video.videoWidth  || 640
  const vH = video.videoHeight || 480

  const lIris = lms[468]   // person's left  iris centre
  const rIris = lms[473]   // person's right iris centre

  const lx = lIris.x * vW,  ly = lIris.y * vH
  const rx = rIris.x * vW,  ry = rIris.y * vH

  const angle   = Math.atan2(ry - ly, rx - lx)
  const eyeDist = Math.sqrt((rx - lx) ** 2 + (ry - ly) ** 2)
  if (eyeDist < 5) return null

  // ── ArcFace canonical 112×112 alignment ──────────────────────────────────
  const SIZE        = 112
  const EYE_DIST_PX = 35.24   // distance between canonical eye centres
  const EYE_Y_PX    = 51.6    // y position of eye midpoint in canonical image

  const scale   = EYE_DIST_PX / eyeDist
  const centreX = (lx + rx) / 2
  const centreY = (ly + ry) / 2

  const aligned = document.createElement("canvas")
  aligned.width  = SIZE
  aligned.height = SIZE

  const ctx = aligned.getContext("2d")
  if (!ctx) return null

  ctx.save()
  ctx.translate(SIZE / 2, EYE_Y_PX)
  ctx.rotate(-angle)
  ctx.scale(scale, scale)
  ctx.translate(-centreX, -centreY)
  ctx.drawImage(video, 0, 0, vW, vH)
  ctx.restore()

  // ── Per-channel histogram equalisation ───────────────────────────────────
  // Normalises brightness / contrast independently in R, G, B so that
  // contouring makeup, lighting differences, and ID-print colour shifts
  // don't skew the embedding — without converting to greyscale.
  const img  = ctx.getImageData(0, 0, SIZE, SIZE)
  const px   = img.data
  const n    = SIZE * SIZE

  for (let ch = 0; ch < 3; ch++) {
    const hist = new Array<number>(256).fill(0)
    for (let i = 0; i < n; i++) hist[px[i * 4 + ch]]++

    let cdfMin = 0, cum = 0
    const lut = new Uint8Array(256)
    for (let v = 0; v < 256; v++) {
      cum += hist[v]
      if (cdfMin === 0 && cum > 0) cdfMin = cum
      lut[v] = Math.max(0, Math.round((cum - cdfMin) / (n - cdfMin) * 255))
    }
    for (let i = 0; i < n; i++) px[i * 4 + ch] = lut[px[i * 4 + ch]]
  }
  ctx.putImageData(img, 0, 0)

  const descriptor = await computeArcFaceDescriptor(aligned)

  // Capture raw RGBA pixels for optional server-side R50 re-inference
  const rawImg = ctx.getImageData(0, 0, SIZE, SIZE)
  // Safe loop — spreading 50,176 args into String.fromCharCode crashes iOS Safari
  let binary = ""
  const bytes = rawImg.data
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  const cropPixels = btoa(binary)

  return { descriptor, cropPixels }
}
