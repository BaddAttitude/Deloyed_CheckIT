export interface ExtractedIDData {
  fullName:       string | null
  documentNumber: string | null
  dateOfBirth:    string | null
  expiryDate:     string | null
  nationality:    string | null
  sex:            string | null
  isExpired:      boolean | null   // null = couldn't determine
  mrzValid:       boolean | null   // null = no MRZ detected
  rawText:        string | null    // first ~600 chars of OCR output
  ocrFailed:      boolean          // true = OCR failed to run
  // UK Driving Licence specific fields
  surname:        string | null
  firstName:      string | null
  middleName:     string | null
  licenceNumber:  string | null
  issueDate:      string | null
}

// ── Month lookup ─────────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
  JANUARY: 0, FEBRUARY: 1, MARCH: 2, APRIL: 3, JUNE: 5,
  JULY: 6, AUGUST: 7, SEPTEMBER: 8, OCTOBER: 9, NOVEMBER: 10, DECEMBER: 11,
}

function parseDate(s: string): Date | null {
  s = s.trim().toUpperCase().replace(/[O]/g, "0")

  // DD/MM/YYYY  MM/DD/YYYY  DD-MM-YYYY  DD.MM.YYYY
  let m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/)
  if (m) {
    const a = parseInt(m[1]), b = parseInt(m[2]), y = parseInt(m[3])
    const day = a > 12 ? a : (b > 12 ? b : a)
    const mon = a > 12 ? b : (b > 12 ? a : b)
    const d = new Date(y, mon - 1, day)
    if (!isNaN(d.getTime())) return d
  }

  // YYYY-MM-DD  YYYY/MM/DD
  m = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/)
  if (m) {
    const d = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]))
    if (!isNaN(d.getTime())) return d
  }

  // DD MMM YYYY  or  DD MMMM YYYY
  m = s.match(/^(\d{1,2})\s+([A-Z]+)\s+(\d{4})$/)
  if (m) {
    const monthIdx = MONTHS[m[2]]
    if (monthIdx !== undefined) {
      const d = new Date(parseInt(m[3]), monthIdx, parseInt(m[1]))
      if (!isNaN(d.getTime())) return d
    }
  }

  // MRZ date: YYMMDD
  m = s.match(/^(\d{2})(\d{2})(\d{2})$/)
  if (m) {
    const yy   = parseInt(m[1])
    const year = yy <= 35 ? 2000 + yy : 1900 + yy
    const d    = new Date(year, parseInt(m[2]) - 1, parseInt(m[3]))
    if (!isNaN(d.getTime())) return d
  }

  return null
}

// ── MRZ check-digit algorithm (ICAO 9303) ────────────────────────────────────

const MRZ_CHAR_VALUE: Record<string, number> = { "<": 0 }
for (let i = 0; i <= 9; i++) MRZ_CHAR_VALUE[String(i)] = i
for (let i = 0; i < 26; i++) MRZ_CHAR_VALUE[String.fromCharCode(65 + i)] = i + 10

function mrzCheckDigit(field: string): number {
  const w = [7, 3, 1]
  return field.split("").reduce((sum, ch, i) => sum + (MRZ_CHAR_VALUE[ch] ?? 0) * w[i % 3], 0) % 10
}

function validateMrzLine2(line2: string): boolean {
  if (line2.length < 15) return false
  const dobOk    = mrzCheckDigit(line2.substring(0, 6))  === parseInt(line2[6])
  const expiryOk = mrzCheckDigit(line2.substring(8, 14)) === parseInt(line2[14])
  return dobOk && expiryOk
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmt(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

// ── MRZ name parser ───────────────────────────────────────────────────────────
// TD3 line 1: P<GBRSURNAME<<GIVEN<NAMES<<<<<
// TD1 line 3: SURNAME<<GIVEN<NAMES<<<<<<<<<<<<
function parseMrzName(namePart: string): string | null {
  const clean = namePart.replace(/</g, " ").trim()
  const [surname, ...given] = clean.split(/\s{2,}/)
  const givenClean = given.join(" ").replace(/\s+/g, " ").trim()
  if (!surname) return null
  const full = givenClean ? `${givenClean} ${surname}` : surname
  return titleCase(full.replace(/\s+/g, " ").trim()) || null
}

// ── OCR via OCR.space API ─────────────────────────────────────────────────────

async function runOCR(imageSrc: string): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60_000) // 60s max

  try {
    const res = await fetch("/api/ocr", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ imageData: imageSrc }),
      signal:  controller.signal,
    })

    if (!res.ok) throw new Error(`OCR route responded with ${res.status}`)

    const json = await res.json()
    if (json.error && !json.text) throw new Error(json.error)

    return (json.text as string) ?? ""
  } finally {
    clearTimeout(timeout)
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function extractIDData(imageSrc: string): Promise<ExtractedIDData> {
  const result: ExtractedIDData = {
    fullName:       null,
    documentNumber: null,
    dateOfBirth:    null,
    expiryDate:     null,
    nationality:    null,
    sex:            null,
    isExpired:      null,
    mrzValid:       null,
    rawText:        null,
    ocrFailed:      false,
    surname:        null,
    firstName:      null,
    middleName:     null,
    licenceNumber:  null,
    issueDate:      null,
  }

  try {
    const text = await runOCR(imageSrc)

    if (!text || text.trim().length === 0) {
      result.ocrFailed = true
      return result
    }

    // Store trimmed raw text for display
    result.rawText = text.trim().substring(0, 600)

    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean)
    const upper = text.toUpperCase()

    // ── Full Name ─────────────────────────────────────────────────────────────
    const nameMatch = upper.match(
      /(?:SURNAME|LAST\s*NAME|FAMILY\s*NAME|NOM)[:\s]+([A-Z\s\-]+)/
    )
    const givenMatch = upper.match(
      /(?:FIRST\s*NAME|GIVEN\s*NAME|FORENAME|PRENOM|VORNAME)[:\s]+([A-Z\s\-]+)/
    )
    if (nameMatch && givenMatch) {
      const sur   = titleCase(nameMatch[1].trim().split(/\s{2,}/)[0])
      const given = titleCase(givenMatch[1].trim().split(/\s{2,}/)[0])
      result.fullName = `${given} ${sur}`.trim()
    } else if (nameMatch) {
      result.fullName = titleCase(nameMatch[1].trim().split(/\s{2,}/)[0])
    }

    // ── UK Driving Licence — individual name fields + licence number ──────────
    // Titles to strip from field 2 (e.g. "2. MR ONYEKA GODSTIME" → ONYEKA / GODSTIME)
    const TITLES = new Set(["MR", "MRS", "MS", "MISS", "DR", "PROF", "REV", "SIR", "LADY"])

    // Try DVLA numeric field labels ("1. GODDEY", "2. MR ONYEKA GODSTIME", "4d/5. GODDE...")
    for (const line of lines) {
      const ul = line.toUpperCase()

      // Field 1 → Surname
      if (!result.surname) {
        const m = ul.match(/^1\s*[.]\s*([A-Z][A-Z\-]+)/)
        if (m) result.surname = titleCase(m[1].trim())
      }

      // Field 2 → Given names (strip title prefix like MR, MRS, etc.)
      if (!result.firstName) {
        const m = ul.match(/^2\s*[.]\s*(.+)/)
        if (m) {
          const words = m[1].trim().split(/\s+/).filter(Boolean)
          if (TITLES.has(words[0])) words.shift()          // remove title
          result.firstName  = titleCase(words[0] ?? "")
          result.middleName = words.length > 1 ? titleCase(words.slice(1).join(" ")) : null
        }
      }

      // Field 3 → Date of birth (and optional nationality after the date)
      if (!result.dateOfBirth) {
        const m = ul.match(/^3\s*[.]\s*(\d{1,2}[.\-\/]\d{1,2}[.\-\/]\d{4})/)
        if (m) {
          const d = parseDate(m[1])
          if (d) result.dateOfBirth = fmt(d)
          // Nationality may follow the date on the same line, e.g. "13.04.2005 NIGERIA"
          const natM = ul.match(/^3\s*[.]\s*[\d.\-\/]+\s+([A-Z]{4,})/)
          if (natM && !result.nationality) result.nationality = titleCase(natM[1])
        }
      }

      // Field 4d OR field 5 → Licence number (card version-dependent label)
      if (!result.licenceNumber) {
        const m = ul.match(/^(?:4D|5)\s*[.]\s*([A-Z]{5}[0-9]{6}[A-Z]{2}[0-9][A-Z]{2})/)
        if (m) result.licenceNumber = m[1]
      }

      // Standalone 16-char DL number on its own line
      if (!result.licenceNumber) {
        const m = ul.match(/^([A-Z]{5}[0-9]{6}[A-Z]{2}[0-9][A-Z]{2})\b/)
        if (m) result.licenceNumber = m[1]
      }

      // Field 4a → Issue date
      if (!result.issueDate) {
        const m = ul.match(/^4A\s*[.]\s*(\d{1,2}[.\-\/]\d{1,2}[.\-\/]\d{4})/)
        if (m) {
          const d = parseDate(m[1])
          if (d) result.issueDate = fmt(d)
        }
      }

      // Field 4b → Expiry date (overrides any earlier generic match for accuracy)
      {
        const m = ul.match(/^4B\s*[.]\s*(\d{1,2}[.\-\/]\d{1,2}[.\-\/]\d{4})/)
        if (m) {
          const d = parseDate(m[1])
          if (d) {
            result.expiryDate = fmt(d)
            result.isExpired  = d < new Date()
          }
        }
      }
    }

    // Fallback: populate surname/given names from generic label matches
    if (!result.surname && nameMatch) {
      result.surname = titleCase(nameMatch[1].trim().split(/\s{2,}/)[0])
    }
    if (!result.firstName && givenMatch) {
      const words = givenMatch[1].trim().split(/\s+/).filter(Boolean)
      if (TITLES.has(words[0]?.toUpperCase())) words.shift()
      result.firstName  = titleCase(words[0] ?? "")
      result.middleName = words.length > 1 ? titleCase(words.slice(1).join(" ")) : null
    }

    // Fallback: scan full text for 16-char DL number anywhere
    if (!result.licenceNumber) {
      const m = upper.match(/\b([A-Z]{5}[0-9]{6}[A-Z]{2}[0-9][A-Z]{2})\b/)
      if (m) result.licenceNumber = m[1]
    }

    // Derive fullName from DL fields if not already found
    if (!result.fullName && result.firstName && result.surname) {
      const mid = result.middleName ? ` ${result.middleName}` : ""
      result.fullName = `${result.firstName}${mid} ${result.surname}`
    }

    // ── Document Number ───────────────────────────────────────────────────────
    const docMatch = upper.match(
      /(?:DOCUMENT\s*(?:NO|NUMBER|#)|PASSPORT\s*(?:NO|NUMBER)|ID\s*(?:NO|NUMBER)|LICENCE\s*(?:NO|NUMBER)|LICENSE\s*(?:NO|NUMBER)|PERSONAL\s*(?:NO|NUMBER))[:\s#]+([A-Z0-9]{5,12})/
    )
    if (docMatch) {
      result.documentNumber = docMatch[1].trim()
    }

    // ── Date of Birth ─────────────────────────────────────────────────────────
    const dobMatch = upper.match(
      /(?:DATE\s*OF\s*BIRTH|D\.?\s*O\.?\s*B\.?|BIRTH\s*DATE|BORN|NAISSANCE|GEBURTSDATUM|DATE\s*NAISS)[:\s\-]*([0-9A-Z\s\/\-\.]{5,20})/
    )
    if (dobMatch) {
      const raw = dobMatch[1].trim().split(/\s{2,}/)[0].substring(0, 15).trim()
      const d = parseDate(raw)
      if (d) result.dateOfBirth = fmt(d)
    }

    // ── Expiry Date ───────────────────────────────────────────────────────────
    const expMatch = upper.match(
      /(?:EXPIR(?:Y|ATION|ES?)|EXP(?:\s*DATE)?|VALID\s*(?:UNTIL|THRU?|TO|THROUGH)|DATE\s*OF\s*EXPIR\w*|DATE\s*D.EXPI)[:\s\-]*([0-9A-Z\s\/\-\.]{5,20})/
    )
    if (expMatch) {
      const raw = expMatch[1].trim().split(/\s{2,}/)[0].substring(0, 15).trim()
      const d = parseDate(raw)
      if (d) {
        result.expiryDate = fmt(d)
        result.isExpired  = d < new Date()
      }
    }

    // ── Nationality ───────────────────────────────────────────────────────────
    const natMatch = upper.match(
      /(?:NATIONALITY|NATIONALITE|NATIONALITÄT|NATIONALIDAD)[:\s]+([A-Z]{2,30})/
    )
    if (natMatch) {
      result.nationality = titleCase(natMatch[1].trim().split(/\s+/)[0])
    }

    // ── Sex / Gender ──────────────────────────────────────────────────────────
    const sexMatch = upper.match(
      /(?:^|\s)(?:SEX|GENDER|SEXE|GESCHLECHT)[:\s]+([MFX](?:ALE|EMALE)?)\b/
    )
    if (sexMatch) {
      const raw = sexMatch[1].trim()
      result.sex = raw === "M" || raw === "MALE"   ? "Male"
                 : raw === "F" || raw === "FEMALE" ? "Female"
                 : "Other"
    }

    // ── MRZ parsing ───────────────────────────────────────────────────────────
    // Collect lines that look like MRZ: 20+ chars of A-Z, 0-9, <
    const mrzLines = lines.filter((l) => /^[A-Z0-9<\s]{20,}$/.test(l))

    if (mrzLines.length >= 2) {
      const line1 = mrzLines[0].replace(/\s/g, "")
      const line2 = mrzLines[1].replace(/\s/g, "")

      // ── Name from MRZ line 1 ──────────────────────────────────────────────
      if (!result.fullName && line1.length >= 5) {
        const namePart = line1.substring(5)
        result.fullName = parseMrzName(namePart)
      }

      // ── Nationality from MRZ line 1 ───────────────────────────────────────
      if (!result.nationality && line1.length >= 5) {
        const nat = line1.substring(2, 5).replace(/</g, "").trim()
        if (nat.length === 3) result.nationality = nat
      }

      if (line2.length >= 15) {
        // ── Document number from MRZ line 2 (first 9 chars) ──────────────────
        if (!result.documentNumber) {
          const docNum = line2.substring(0, 9).replace(/</g, "").trim()
          if (docNum.length >= 3) result.documentNumber = docNum
        }

        // ── DOB from MRZ line 2 positions 0–5 ────────────────────────────────
        if (!result.dateOfBirth) {
          const d = parseDate(line2.substring(0, 6))
          if (d) result.dateOfBirth = fmt(d)
        }

        // ── Sex from MRZ line 2 position 7 ───────────────────────────────────
        if (!result.sex) {
          const s = line2[7]
          result.sex = s === "M" ? "Male" : s === "F" ? "Female" : null
        }

        // ── Expiry from MRZ line 2 positions 8–13 ────────────────────────────
        if (!result.expiryDate) {
          const d = parseDate(line2.substring(8, 14))
          if (d) {
            result.expiryDate = fmt(d)
            result.isExpired  = d < new Date()
          }
        }

        // ── MRZ checksum validation ───────────────────────────────────────────
        result.mrzValid = validateMrzLine2(line2)
      }
    }

    // Populate documentNumber from licenceNumber if not already extracted
    if (!result.documentNumber && result.licenceNumber) {
      result.documentNumber = result.licenceNumber
    }

  } catch {
    result.ocrFailed = true
  }

  return result
}
