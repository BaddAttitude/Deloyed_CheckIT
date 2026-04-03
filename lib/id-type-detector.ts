"use client"

// ── ID Type Detector ──────────────────────────────────────────────────────────
// Analyses pixel data sampled from the card guide region and classifies the
// document type by sampling the header hue, overall brightness, and structural
// edge patterns.  No ML model needed — card types have distinctive colour zones.

export type IDType = "UK_DL" | "UK_PASSPORT" | "EU_ID" | "OTHER_ID" | "UNKNOWN"

export interface IDTypeResult {
  type        : IDType
  label       : string
  authority   : string
  confidence  : number   // 0–1
}

const META: Record<IDType, Pick<IDTypeResult, "label" | "authority">> = {
  UK_DL       : { label: "UK Driving Licence",  authority: "DVLA · United Kingdom"          },
  UK_PASSPORT : { label: "UK Passport",          authority: "HM Passport Office"             },
  EU_ID       : { label: "EU National ID",       authority: "European Union Member State"    },
  OTHER_ID    : { label: "Identity Document",    authority: "Issuing authority unknown"      },
  UNKNOWN     : { label: "Unknown Document",     authority: "Cannot identify document type"  },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** RGB → HSV, hue in [0, 360] */
function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
  const d = max - min
  let h = 0
  if (d > 0) {
    if      (max === rn) h = ((gn - bn) / d + 6) % 6
    else if (max === gn) h = (bn - rn) / d + 2
    else                 h = (rn - gn) / d + 4
    h *= 60
  }
  return [h, max > 0 ? d / max : 0, max]
}

interface RegionStats {
  meanHue : number
  meanSat : number
  meanVal : number
  meanLum : number
  edgeDensity: number
}

function sampleRegion(
  data  : Uint8ClampedArray,
  W     : number,   // full sample width
  H     : number,   // full sample height
  x0f   : number,   // region left   (0-1)
  y0f   : number,   // region top    (0-1)
  x1f   : number,   // region right  (0-1)
  y1f   : number,   // region bottom (0-1)
): RegionStats {
  const x0 = Math.floor(x0f * W), x1 = Math.ceil(x1f * W)
  const y0 = Math.floor(y0f * H), y1 = Math.ceil(y1f * H)

  let hSum = 0, sSum = 0, vSum = 0, lSum = 0, eSum = 0, count = 0

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 4
      const r = data[i], g = data[i + 1], b = data[i + 2]
      const [h, s, v] = rgbToHsv(r, g, b)
      hSum += h; sSum += s; vSum += v
      lSum += 0.299 * r + 0.587 * g + 0.114 * b
      // Simple edge magnitude using next-pixel diff
      if (x + 1 < x1 && y + 1 < y1) {
        const ir = (y * W + x + 1) * 4
        const id = ((y + 1) * W + x) * 4
        eSum += Math.abs(data[i] - data[ir]) + Math.abs(data[i + 1] - data[ir + 1])
               + Math.abs(data[i] - data[id]) + Math.abs(data[i + 1] - data[id + 1])
      }
      count++
    }
  }

  return {
    meanHue : hSum  / count,
    meanSat : sSum  / count,
    meanVal : vSum  / count,
    meanLum : lSum  / count,
    edgeDensity: eSum / count,
  }
}

// ── Main classifier ───────────────────────────────────────────────────────────
// imageData: pixel data of the guide region downscaled to sampleW × sampleH

export function detectIDType(
  imageData : Uint8ClampedArray,
  sampleW   : number,
  sampleH   : number,
): IDTypeResult {
  // ── Region samples ────────────────────────────────────────────────────────
  // Header bar  (top 12 %, left 82 % — UK DL is teal/dark, passport is navy)
  const header  = sampleRegion(imageData, sampleW, sampleH, 0.00, 0.00, 0.82, 0.12)
  // Overall card brightness + texture
  const overall = sampleRegion(imageData, sampleW, sampleH, 0.00, 0.00, 1.00, 1.00)
  // Right column (entitlements table on UK DL — dense grid = high edge density)
  const rightCol = sampleRegion(imageData, sampleW, sampleH, 0.54, 0.12, 1.00, 0.88)
  // Bottom strip (MRZ on passport = very high edge density from OCR characters)
  const bottom  = sampleRegion(imageData, sampleW, sampleH, 0.00, 0.86, 1.00, 1.00)

  // ── Feature extraction ────────────────────────────────────────────────────
  const headerHue  = header.meanHue
  const headerSat  = header.meanSat
  const headerDark = header.meanLum < 80   // dark header = DL/passport
  const cardBright = overall.meanLum > 140 // bright overall = white card (DL)
  const hasMRZ     = bottom.edgeDensity > 18  // dense bottom = MRZ text
  const hasTable   = rightCol.edgeDensity > 10 // grid pattern = DL table

  // ── Classification rules ──────────────────────────────────────────────────

  // UK Driving Licence: teal/blue-green header (hue 160–220°), moderate sat,
  // dark header, very bright card body, high-edge right column (table).
  if (
    headerHue > 155 && headerHue < 225 &&
    headerSat > 0.25 &&
    headerDark &&
    cardBright &&
    hasTable
  ) {
    return { ...META.UK_DL,       type: "UK_DL",       confidence: 0.88 }
  }

  // UK Passport data page: navy header (hue 210–260°, dark, less bright overall)
  // Has MRZ at bottom (high edge density).
  if (
    headerHue > 200 && headerHue < 265 &&
    headerSat > 0.30 &&
    headerDark &&
    hasMRZ
  ) {
    return { ...META.UK_PASSPORT, type: "UK_PASSPORT",  confidence: 0.82 }
  }

  // EU National ID: similar dimensions to DL but different header palette.
  // Many EU IDs use red/pink or light blue headers.
  if (
    headerSat > 0.20 &&
    headerDark &&
    cardBright &&
    !hasMRZ
  ) {
    return { ...META.EU_ID,       type: "EU_ID",        confidence: 0.60 }
  }

  // Generic bright ID card
  if (cardBright) {
    return { ...META.OTHER_ID,    type: "OTHER_ID",     confidence: 0.50 }
  }

  return { ...META.UNKNOWN,       type: "UNKNOWN",      confidence: 0.20 }
}
