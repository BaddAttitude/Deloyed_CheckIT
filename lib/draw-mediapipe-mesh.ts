import type { MeshConnections, MpConnection } from "./mediapipe-face-landmarker"

/** Minimal normalised landmark shape (matches MediaPipe NormalizedLandmark). */
interface Landmark { x: number; y: number; z: number }

/**
 * Draws all 468 MediaPipe face-mesh landmarks on a canvas.
 *
 * Layers (back → front):
 *   1. Full tesselation  — ~1 434 thin semi-transparent edges (the "holographic" mesh)
 *   2. Anatomical regions — eyes, brows, lips, face oval in brighter white
 *   3. Iris rings        — electric blue (landmarks 468–477 are the iris points)
 *   4. 468 glowing dots  — blue outer glow + white core at every landmark
 *
 * @param canvas      Target canvas matched to display dimensions
 * @param landmarks   468 normalised landmarks from FaceLandmarker.detectForVideo
 * @param connections Connection arrays from loadFaceLandmarker()
 * @param mirrored    true when the video stream is CSS-mirrored (front camera)
 */
export function drawMediaPipeMesh(
  canvas     : HTMLCanvasElement,
  landmarks  : Landmark[],
  connections: MeshConnections,
  mirrored   = false
) {
  const ctx = canvas.getContext("2d")
  if (!ctx || landmarks.length === 0) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const W = canvas.width
  const H = canvas.height

  // Mirror x when the video is CSS-flipped (selfie mode)
  const px = (lm: Landmark) => mirrored ? W * (1 - lm.x) : W * lm.x
  const py = (lm: Landmark) => H * lm.y

  // Draws a list of {start,end} edges using the current ctx stroke state
  const stroke = (edges: MpConnection[]) => {
    for (const { start, end } of edges) {
      if (start >= landmarks.length || end >= landmarks.length) continue
      const a = landmarks[start]
      const b = landmarks[end]
      ctx.beginPath()
      ctx.moveTo(px(a), py(a))
      ctx.lineTo(px(b), py(b))
      ctx.stroke()
    }
  }

  // ── Layer 1: Full tesselation ─────────────────────────────────────────────
  ctx.shadowBlur  = 0
  ctx.strokeStyle = "rgba(255, 255, 255, 0.16)"
  ctx.lineWidth   = 0.6
  stroke(connections.tesselation)

  // ── Layer 2: Anatomical region outlines ───────────────────────────────────
  ctx.shadowColor = "rgba(96, 165, 250, 0.35)"
  ctx.shadowBlur  = 4
  ctx.strokeStyle = "rgba(255, 255, 255, 0.55)"
  ctx.lineWidth   = 1.1
  stroke(connections.faceOval)
  stroke(connections.leftEye)
  stroke(connections.rightEye)
  stroke(connections.leftEyebrow)
  stroke(connections.rightEyebrow)
  stroke(connections.lips)

  // ── Layer 3: Iris rings ───────────────────────────────────────────────────
  ctx.shadowColor = "#60a5fa"
  ctx.shadowBlur  = 8
  ctx.strokeStyle = "rgba(96, 165, 250, 0.95)"
  ctx.lineWidth   = 1.4
  stroke(connections.leftIris)
  stroke(connections.rightIris)

  ctx.shadowBlur = 0

  // ── Layer 4: All 468 glowing landmark dots ────────────────────────────────
  const dotCount = Math.min(landmarks.length, 468)

  // Outer glow ring
  ctx.shadowColor = "#60a5fa"
  ctx.shadowBlur  = 10
  ctx.fillStyle   = "#93c5fd"
  for (let i = 0; i < dotCount; i++) {
    const lm = landmarks[i]
    ctx.beginPath()
    ctx.arc(px(lm), py(lm), 2.2, 0, Math.PI * 2)
    ctx.fill()
  }

  // Bright white core
  ctx.shadowBlur = 0
  ctx.fillStyle  = "#ffffff"
  for (let i = 0; i < dotCount; i++) {
    const lm = landmarks[i]
    ctx.beginPath()
    ctx.arc(px(lm), py(lm), 0.9, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.shadowBlur  = 0
  ctx.globalAlpha = 1
}
