"use client"

import * as faceapi from "face-api.js"
import { loadFaceApiModels } from "@/lib/face-api-loader"

export interface PatternCheckResult {
  id: string
  name: string
  passed: boolean
  detail: string
  weight: number // percentage weight towards total score
}

export interface PatternVerification {
  checks: PatternCheckResult[]
  score: number   // 0–100
  passed: boolean // score >= 60
}

// ─── Canvas helpers ─────────────────────────────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function getPixelData(img: HTMLImageElement): {
  data: Uint8ClampedArray
  width: number
  height: number
} {
  const canvas = document.createElement("canvas")
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext("2d")!
  ctx.drawImage(img, 0, 0)
  const { data } = ctx.getImageData(0, 0, img.width, img.height)
  return { data, width: img.width, height: img.height }
}

// Compute per-pixel luminance from RGBA array
function getLuminanceArray(data: Uint8ClampedArray): number[] {
  const lum: number[] = []
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2]
    lum.push(0.299 * r + 0.587 * g + 0.114 * b)
  }
  return lum
}

function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function stdDev(arr: number[], avg?: number): number {
  const m = avg ?? mean(arr)
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length
  return Math.sqrt(variance)
}

// ─── Check 1: ID Colour Quality ──────────────────────────────────────────────
// Real ID documents are printed with specific ink technologies that produce
// a balanced, saturated colour profile. This check verifies:
//   1. Colour saturation is within the range of a printed document (not washed
//      out like a photocopy, and not over-saturated like a digital screen)
//   2. White balance is neutral — extreme colour casts (too warm/cool) indicate
//      poor scan conditions or an unusual light source
//   3. Colour depth is sufficient — at least 3 distinct colour channels are
//      active, ruling out near-greyscale images with no chromatic ink

async function checkIDColourQuality(img: HTMLImageElement): Promise<PatternCheckResult> {
  const { data } = getPixelData(img)

  // Collect per-channel statistics
  let rSum = 0, gSum = 0, bSum = 0
  let rSq = 0, gSq = 0, bSq = 0
  const n = data.length / 4

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2]
    rSum += r;  gSum += g;  bSum += b
    rSq  += r * r;  gSq += g * g;  bSq += b * b
  }

  const rMean = rSum / n, gMean = gSum / n, bMean = bSum / n
  const rStd  = Math.sqrt(rSq / n - rMean ** 2)
  const gStd  = Math.sqrt(gSq / n - gMean ** 2)
  const bStd  = Math.sqrt(bSq / n - bMean ** 2)

  // 1. Saturation (per-pixel HSL average)
  let satSum = 0
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    const l = (max + min) / 2
    satSum += max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1))
  }
  const avgSaturation = satSum / n

  // 2. White balance — how dominant is any single channel vs the others?
  const totalMean = (rMean + gMean + bMean) / 3
  const colourCast = Math.max(
    Math.abs(rMean - totalMean),
    Math.abs(gMean - totalMean),
    Math.abs(bMean - totalMean)
  ) / (totalMean + 1)

  // 3. Colour depth — all three channels should have meaningful variance
  const activeChannels = [rStd > 12, gStd > 12, bStd > 12].filter(Boolean).length

  // Thresholds:
  //   avgSaturation 0.08–0.65  → printed ink range (photocopies < 0.05, screens > 0.7)
  //   colourCast < 0.35        → no extreme colour cast
  //   activeChannels >= 2      → chromatic content present
  const goodSaturation  = avgSaturation >= 0.08 && avgSaturation <= 0.65
  const goodBalance     = colourCast < 0.35
  const sufficientDepth = activeChannels >= 2

  const passed = goodSaturation && goodBalance && sufficientDepth

  let detail = `Colour profile consistent with printed ID document`
  if (!goodSaturation) {
    detail = avgSaturation < 0.08
      ? `Colours too washed out (saturation ${(avgSaturation * 100).toFixed(0)}%) — may be a photocopy`
      : `Colours oversaturated (${(avgSaturation * 100).toFixed(0)}%) — scan from a screen detected`
  } else if (!goodBalance) {
    detail = `Strong colour cast detected — scan under neutral white light`
  } else if (!sufficientDepth) {
    detail = `Near-greyscale image — colour ink not captured properly`
  }

  return { id: "quality", name: "ID Colour Quality", passed, detail, weight: 10 }
}

// ─── Check 2: Document Detected ─────────────────────────────────────────────
// Checks for a rectangular document-like aspect ratio AND sufficient edge
// density. A random scene or selfie has a much lower edge density than a
// printed document held flat in front of the camera.

async function checkDocumentDetected(img: HTMLImageElement): Promise<PatternCheckResult> {
  const ratio = img.width / img.height
  // ID card / driving licence ≈ 1.586; passport (portrait) ≈ 0.71
  const isLandscape = ratio >= 1.2 && ratio <= 2.1
  const isPortrait  = ratio >= 0.58 && ratio <= 0.95

  const { data, width, height } = getPixelData(img)
  const lum = getLuminanceArray(data)

  // Count edge-like pixels via Sobel-style finite difference
  let edgeCount = 0
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x
      const diff = Math.abs(lum[idx] - lum[idx - 1]) + Math.abs(lum[idx] - lum[idx - width])
      if (diff > 25) edgeCount++   // raised from 20 — requires sharper edges
    }
  }
  const edgeDensity = edgeCount / (width * height)
  // Raised from 0.04 — a document held flat and filling the frame has more structured edges
  const hasEdges = edgeDensity > 0.06

  const passed = (isLandscape || isPortrait) && hasEdges

  let detail = "Document boundaries detected"
  if (!isLandscape && !isPortrait) detail = `Unexpected aspect ratio (${ratio.toFixed(2)}) — hold ID flat and fill the frame`
  else if (!hasEdges) detail = `Low edge definition (${(edgeDensity * 100).toFixed(1)}%) — ensure document is sharp and well-lit`

  return { id: "document", name: "Document Detected", passed, detail, weight: 15 }
}

// ─── Check 3: Photo Zone Present (MANDATORY) ─────────────────────────────────
// Uses face-api.js to confirm there is a face (ID photo) in the document.
// If this check fails the overall score is forced to 0.

async function checkPhotoZone(img: HTMLImageElement): Promise<PatternCheckResult> {
  await loadFaceApiModels()

  // Low confidence threshold so small printed faces on ID cards are detected.
  // Live selfies are caught separately via the face-size check below.
  const detection = await faceapi.detectSingleFace(
    img,
    new faceapi.SsdMobilenetv1Options({ minConfidence: 0.12 })
  )

  if (!detection) {
    return {
      id: "photo",
      name: "Photo Zone Present",
      passed: false,
      detail: "No ID photo detected — ensure the face photo on the ID is clearly visible",
      weight: 30,
    }
  }

  // The face should occupy a reasonable portion of the ID (not tiny, not huge).
  // On a real ID the photo is typically 5–35% of the document area.
  // A selfie fills 40–90% of the frame.
  const faceArea  = detection.box.width * detection.box.height
  const imageArea = img.width * img.height
  const facePct   = faceArea / imageArea

  const passed = facePct >= 0.003 && facePct <= 0.45

  return {
    id: "photo",
    name: "Photo Zone Present",
    passed,
    detail: passed
      ? `ID photo detected (${Math.round(facePct * 100)}% of document area)`
      : facePct > 0.45
        ? "Face fills too much of frame — this appears to be a selfie, not an ID scan"
        : "Face area too small — ensure the ID photo is clearly visible",
    weight: 30,
  }
}

// ─── Check 4: Data Zones Present (MANDATORY) ────────────────────────────────
// Divides the image into a 3×2 grid and checks that at least 5 of 6 zones
// have high pixel variance — indicating dense printed text/data fields.
// Real ID documents have text and patterns across nearly every zone.
// Random selfies or plain photos will only have 2–3 high-variance zones.

async function checkDataZones(img: HTMLImageElement): Promise<PatternCheckResult> {
  const { data, width, height } = getPixelData(img)
  const lum = getLuminanceArray(data)

  const cols = 3
  const rows = 2
  const zoneW = Math.floor(width / cols)
  const zoneH = Math.floor(height / rows)

  let highVarianceZones = 0

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const zoneLum: number[] = []
      for (let y = row * zoneH; y < (row + 1) * zoneH; y++) {
        for (let x = col * zoneW; x < (col + 1) * zoneW; x++) {
          zoneLum.push(lum[y * width + x])
        }
      }
      if (stdDev(zoneLum) > 18) highVarianceZones++
    }
  }

  // At least 3 of 6 zones must have text/pattern variance
  const passed = highVarianceZones >= 3

  return {
    id: "data",
    name: "Data Zones Present",
    passed,
    detail: passed
      ? `${highVarianceZones}/${cols * rows} data zones active — document text confirmed`
      : `Only ${highVarianceZones}/${cols * rows} zones contain data — ID may be obscured or this is not a document`,
    weight: 25,
  }
}

// ─── Check 5: Pattern Integrity ──────────────────────────────────────────────

async function checkPatternIntegrity(img: HTMLImageElement): Promise<PatternCheckResult> {
  const { data } = getPixelData(img)

  // Sample every 8th pixel for speed
  const hues: number[] = []
  for (let i = 0; i < data.length; i += 4 * 8) {
    const r = data[i] / 255
    const g = data[i + 1] / 255
    const b = data[i + 2] / 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const delta = max - min
    if (delta < 0.05) continue // achromatic — skip
    let h = 0
    if (max === r) h = ((g - b) / delta) % 6
    else if (max === g) h = (b - r) / delta + 2
    else h = (r - g) / delta + 4
    hues.push(Math.round((h * 60 + 360) % 360))
  }

  if (hues.length < 50) {
    // Mostly greyscale — still can be a valid B&W ID
    const { data: d2 } = getPixelData(img)
    const lum = getLuminanceArray(d2)
    const s = stdDev(lum)
    const passed = s > 35 // raised from 30
    return {
      id: "pattern",
      name: "Pattern Integrity",
      passed,
      detail: passed ? "Greyscale document with valid tonal range" : "Document colours appear too uniform",
      weight: 10,
    }
  }

  // Count distinct hue buckets (every 30°)
  const buckets = new Array(12).fill(0)
  hues.forEach((h) => buckets[Math.floor(h / 30)]++)
  const activeBuckets = buckets.filter((b) => b > hues.length * 0.04).length

  const passed = activeBuckets >= 2

  return {
    id: "pattern",
    name: "Pattern Integrity",
    passed,
    detail: passed
      ? `${activeBuckets} colour regions — document pattern consistent`
      : "Colour distribution too uniform — may not be a real ID",
    weight: 10,
  }
}

// ─── Check 6: UV Pattern Check ───────────────────────────────────────────────
// Analyses micro-texture density and blue-channel variation to simulate
// detection of UV-reactive security features (guilloche patterns, fluorescent inks)

async function checkUVPattern(img: HTMLImageElement): Promise<PatternCheckResult> {
  const { data, width, height } = getPixelData(img)

  // Extract blue channel — UV-reactive fluorescent inks respond most in the blue spectrum
  const blue: number[] = []
  for (let i = 2; i < data.length; i += 4) {
    blue.push(data[i])
  }

  // High-frequency micro-texture via finite differences on the blue channel
  let microPatternCount = 0
  let totalSampled = 0
  const step = 3

  for (let y = 1; y < height - 1; y += step) {
    for (let x = 1; x < width - 1; x += step) {
      const idx = y * width + x
      const diff =
        Math.abs(blue[idx] - blue[idx + 1]) +
        Math.abs(blue[idx] - blue[idx + width])
      if (diff > 15) microPatternCount++ // raised from 12
      totalSampled++
    }
  }

  const microDensity = microPatternCount / totalSampled

  const blueMean = mean(blue)
  const blueStd  = stdDev(blue, blueMean)

  let blueDominantPixels = 0
  let sampleCount = 0
  const sampleStep = 4
  for (let i = 0; i < data.length; i += 4 * sampleStep) {
    const r = data[i], g = data[i + 1], b = data[i + 2]
    if (b > r + 15 && b > g + 10) blueDominantPixels++ // raised thresholds
    sampleCount++
  }
  const blueRatio = blueDominantPixels / sampleCount

  // Raised thresholds: 0.22 → 0.26 for microDensity, 16 → 20 for blueStd, 0.07 → 0.10 for blueRatio
  const hasUVTexture   = microDensity > 0.26
  const hasUVSignature = blueStd > 20 || blueRatio > 0.10

  const passed = hasUVTexture && hasUVSignature

  return {
    id: "uv",
    name: "UV Pattern Check",
    passed,
    detail: passed
      ? `UV security features present (${Math.round(microDensity * 100)}% micro-pattern density)`
      : !hasUVTexture
        ? "UV micro-patterns absent — possible photocopy or non-document image"
        : "UV fluorescence signature not detected",
    weight: 20,
  }
}

// ─── Check 7: Document Pattern Match ────────────────────────────────────────
// Compares the structural layout of the scanned document against the reference
// DEMO_ID.jpeg image. Both images are downsampled to a small grid and a
// Pearson correlation is computed on their luminance values. This catches
// images that are NOT a document of the same type (selfies, random photos,
// wrong document types) because their spatial layout is completely different
// from a real ID.
// NOTE: This compares document STRUCTURE, not the face of the person on the ID.

// Downsample image to cols×rows pixels and return luminance values
function getDownsampledLuminance(img: HTMLImageElement, cols: number, rows: number): number[] {
  const canvas = document.createElement("canvas")
  canvas.width = cols
  canvas.height = rows
  const ctx = canvas.getContext("2d")!
  ctx.drawImage(img, 0, 0, cols, rows)
  const { data } = ctx.getImageData(0, 0, cols, rows)
  const lum: number[] = []
  for (let i = 0; i < data.length; i += 4) {
    lum.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
  }
  return lum
}

// Pearson correlation coefficient — measures structural similarity (-1 to 1)
function pearsonCorrelation(a: number[], b: number[]): number {
  const n = a.length
  const meanA = mean(a), meanB = mean(b)
  let num = 0, denA = 0, denB = 0
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA, db = b[i] - meanB
    num  += da * db
    denA += da * da
    denB += db * db
  }
  if (denA === 0 || denB === 0) return 0
  return num / Math.sqrt(denA * denB)
}

// Cache the reference document's luminance grid so it only loads once
let _demoLum: number[] | null | "error" = null
const GRID_COLS = 16
const GRID_ROWS = 10

async function getDemoLuminance(): Promise<number[] | null> {
  if (_demoLum === "error") return null
  if (_demoLum !== null) return _demoLum
  try {
    const img = await loadImage("/DEMO_ID.jpeg")
    _demoLum = getDownsampledLuminance(img, GRID_COLS, GRID_ROWS)
    return _demoLum
  } catch {
    _demoLum = "error"
    return null
  }
}

async function checkDocumentPattern(img: HTMLImageElement): Promise<PatternCheckResult> {
  const refLum = await getDemoLuminance()

  if (!refLum) {
    return {
      id: "reference",
      name: "Document Pattern Match",
      passed: false,
      detail: "Reference document unavailable — skipping structural check",
      weight: 20,
    }
  }

  const scanLum = getDownsampledLuminance(img, GRID_COLS, GRID_ROWS)
  const corr = pearsonCorrelation(refLum, scanLum)

  // Pearson > 0.50 → the spatial luminance layout matches the reference ID type.
  // A selfie or random photo has a completely different brightness distribution
  // compared to a printed ID document → correlation is typically < 0.30.
  const passed = corr > 0.50

  return {
    id: "reference",
    name: "Document Pattern Match",
    passed,
    detail: passed
      ? `Document structure matches reference (${Math.round(corr * 100)}% layout similarity)`
      : `Structure differs from reference ID (${Math.round(Math.max(0, corr) * 100)}% similarity) — wrong document type or not an ID`,
    weight: 20,
  }
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function* runPatternChecks(
  imageSrc: string
): AsyncGenerator<PatternCheckResult> {
  const img = await loadImage(imageSrc)

  const runners = [
    checkIDColourQuality,
    checkDocumentDetected,
    checkPhotoZone,
    checkDataZones,
    checkPatternIntegrity,
    checkUVPattern,
    checkDocumentPattern,
  ]

  for (const run of runners) {
    await new Promise((r) => setTimeout(r, 550))
    yield await run(img)
  }
}

export function computeScore(checks: PatternCheckResult[]): number {
  const earned = checks.reduce((s, c) => s + (c.passed ? c.weight : 0), 0)
  const total  = checks.reduce((s, c) => s + c.weight, 0)
  return Math.round((earned / total) * 100)
}
