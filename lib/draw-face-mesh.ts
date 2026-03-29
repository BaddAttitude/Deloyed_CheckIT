import * as faceapi from "face-api.js"

/**
 * Draws all 68 dlib facial landmarks on a canvas using anatomical group
 * polylines + cross-face triangulation lines + glowing dots at every point.
 *
 * Landmark groups (total = 68):
 *   Jawline      0–16   (17 pts)
 *   Left brow   17–21   ( 5 pts)
 *   Right brow  22–26   ( 5 pts)
 *   Nose bridge 27–30   ( 4 pts)
 *   Nose bottom 31–35   ( 5 pts)
 *   Left eye    36–41   ( 6 pts, closed)
 *   Right eye   42–47   ( 6 pts, closed)
 *   Outer lips  48–59   (12 pts, closed)
 *   Inner lips  60–67   ( 8 pts, closed)
 *
 * @param canvas    - Target canvas already matched to display dimensions
 * @param landmarks - FaceLandmarks68 from face-api.js, resized to display size
 * @param mirrored  - true when the video element is CSS-mirrored (front camera)
 */
export function drawFaceMesh(
  canvas: HTMLCanvasElement,
  landmarks: faceapi.FaceLandmarks68,
  mirrored = false
) {
  const ctx = canvas.getContext("2d")
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const p = landmarks.positions
  const W = canvas.width

  // Mirror x-coord when the video stream is CSS-flipped
  const pt = (i: number) => ({
    x: mirrored ? W - p[i].x : p[i].x,
    y: p[i].y,
  })

  // ── 1. Anatomical group polylines ─────────────────────────────────────────
  // Each array is a sequence of landmark indices drawn as a connected path.
  // Closed groups (eyes, lips) repeat their first index at the end.
  const GROUPS: readonly (readonly number[])[] = [
    [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],    // jawline    (17)
    [17,18,19,20,21],                                // left brow  ( 5)
    [22,23,24,25,26],                                // right brow ( 5)
    [27,28,29,30],                                   // nose bridge( 4)
    [31,32,33,34,35],                                // nose base  ( 5)
    [36,37,38,39,40,41,36],                          // left eye   ( 6, closed)
    [42,43,44,45,46,47,42],                          // right eye  ( 6, closed)
    [48,49,50,51,52,53,54,55,56,57,58,59,48],        // outer lips (12, closed)
    [60,61,62,63,64,65,66,67,60],                    // inner lips ( 8, closed)
  ]

  // ── 2. Cross-face triangulation lines ─────────────────────────────────────
  // Extra edges that connect different groups to give the biometric-mesh look.
  const CROSS: readonly (readonly [number, number])[] = [
    // Jaw frame → brow corners
    [0, 17], [16, 26],

    // Left brow → left eye
    [17, 36], [18, 37], [19, 38], [20, 38], [21, 39],

    // Right brow → right eye
    [22, 42], [23, 43], [24, 44], [25, 44], [26, 45],

    // Between brows ↔ nose bridge top
    [21, 22], [21, 27], [22, 27],

    // Nose bridge ↔ eye inner corners
    [27, 39], [27, 42], [39, 42],

    // Nose bridge tip ↔ nose base
    [30, 31], [30, 33], [30, 35],
    [31, 32], [32, 33], [33, 34], [34, 35],

    // Eye outer corners ↔ cheeks / nostrils
    [36, 31], [45, 35],
    [1,  31], [2,  31], [3,  31],
    [13, 35], [14, 35], [15, 35],

    // Cheeks → jaw ↔ mouth corners
    [0, 36], [16, 45],
    [4, 48], [12, 54],
    [3, 50], [13, 52],

    // Nostrils ↔ mouth corners / upper lip
    [31, 48], [35, 54],
    [33, 51], [33, 57],

    // Jaw chin ↔ lower lip
    [8, 57], [7, 58], [9, 56],
    [6, 58], [10, 56],

    // Outer lip ↔ inner lip (philtrum corners + lip crease)
    [48, 60], [54, 64],
    [50, 61], [52, 63],
    [51, 62],
    [57, 66], [56, 65], [58, 67],

    // Jaw sides ↔ outer lip wrap
    [5, 59], [11, 55],
    [6, 59], [10, 55],
  ]

  // ── Draw group polylines ──────────────────────────────────────────────────
  ctx.strokeStyle = "rgba(255, 255, 255, 0.50)"
  ctx.lineWidth   = 1.0
  ctx.shadowColor = "rgba(96, 165, 250, 0.20)"
  ctx.shadowBlur  = 3

  for (const group of GROUPS) {
    if (group.length < 2) continue
    ctx.beginPath()
    const start = pt(group[0])
    ctx.moveTo(start.x, start.y)
    for (let k = 1; k < group.length; k++) {
      const { x, y } = pt(group[k])
      ctx.lineTo(x, y)
    }
    ctx.stroke()
  }

  // ── Draw cross-face triangulation lines ───────────────────────────────────
  ctx.strokeStyle = "rgba(255, 255, 255, 0.28)"
  ctx.lineWidth   = 0.8
  ctx.shadowBlur  = 2

  for (const [a, b] of CROSS) {
    const pa = pt(a), pb = pt(b)
    ctx.beginPath()
    ctx.moveTo(pa.x, pa.y)
    ctx.lineTo(pb.x, pb.y)
    ctx.stroke()
  }

  // ── Draw glowing dots at all 68 landmark positions ────────────────────────
  // Outer glow
  ctx.shadowColor = "#60a5fa"
  ctx.shadowBlur  = 12
  ctx.fillStyle   = "#93c5fd"

  for (let i = 0; i < 68; i++) {
    const { x, y } = pt(i)
    ctx.beginPath()
    ctx.arc(x, y, 3.0, 0, Math.PI * 2)
    ctx.fill()
  }

  // Bright white core dot
  ctx.shadowBlur = 0
  ctx.fillStyle  = "#ffffff"

  for (let i = 0; i < 68; i++) {
    const { x, y } = pt(i)
    ctx.beginPath()
    ctx.arc(x, y, 1.2, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.shadowBlur  = 0
  ctx.globalAlpha = 1
}
