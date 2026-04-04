/**
 * UK Driving Licence number algorithm (visible-fields derivation).
 *
 * The first 13 characters of a DVLA licence number are deterministic:
 *
 *   SUR(5)  Y1(1)  MM(2)  DD(2)  Y2(1)  I1(1)  I2(1)
 *
 * Where:
 *   SUR   = first 5 letters of surname, padded with '9' if shorter
 *   Y1    = 3rd digit of birth year  (year[2])
 *   MM    = birth month, zero-padded; female adds 50 (so 01–12 → 51–62)
 *   DD    = birth day, zero-padded
 *   Y2    = 4th digit of birth year  (year[3])
 *   I1    = first letter of first name  (or '9')
 *   I2    = first letter of middle name (or '9' if no middle name)
 *
 * We compute both male and female variants because the card does not
 * always expose sex — a match on either variant is sufficient to pass.
 */

export interface UKDLResult {
  /** Cleaned, 5-char padded surname used in computation */
  surField: string
  /** Year digits used: [Y1, Y2] */
  yearDigits: [string, string]
  /** Day string used (DD) */
  dayField: string
  /** Name initials used: [I1, I2] */
  initials: [string, string]
  /** 13-char expected prefix — male (month = 01-12) */
  male: string
  /** 13-char expected prefix — female (month = 51-62) */
  female: string
}

/**
 * Compute the expected UK DL prefix from the visible document fields.
 *
 * @param surname     Surname as it appears on the licence (e.g. "GODDEY")
 * @param firstName   First given name               (e.g. "GODSTIME")
 * @param middleName  Second given name or null/""   (e.g. "ONYEKA")
 * @param dob         Date of birth — accepts:
 *                      • Date object
 *                      • "DD.MM.YYYY" / "DD/MM/YYYY" / "DD-MM-YYYY"
 *                      • "YYYY-MM-DD"
 */
export function computeUKDLPrefix(
  surname   : string,
  firstName : string,
  middleName: string | null | undefined,
  dob       : Date | string
): UKDLResult {
  // ── 1. Surname → 5-char field ──────────────────────────────────────────────
  const surClean = surname.toUpperCase().replace(/[^A-Z]/g, "")
  const surField = (surClean + "99999").slice(0, 5)

  // ── 2. Parse DOB ───────────────────────────────────────────────────────────
  let dobDate: Date
  if (dob instanceof Date) {
    dobDate = dob
  } else {
    const s = dob.trim().replace(/[Oo]/g, "0")   // OCR often confuses O and 0

    // DD.MM.YYYY  DD/MM/YYYY  DD-MM-YYYY
    let m = s.match(/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4})$/)
    if (m) {
      const a = parseInt(m[1]), b = parseInt(m[2]), y = parseInt(m[3])
      const day = a > 12 ? a : (b > 12 ? b : a)
      const mon = a > 12 ? b : (b > 12 ? a : b)
      dobDate = new Date(y, mon - 1, day)
    } else {
      // YYYY-MM-DD
      m = s.match(/^(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})$/)
      if (m) {
        dobDate = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]))
      } else {
        // DD MMM YYYY  or  DD MMMM YYYY  (e.g. "13 Apr 2005" — OCR display format)
        m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/)
        if (m) {
          const MONTH_MAP: Record<string, number> = {
            JAN:1, FEB:2, MAR:3, APR:4, MAY:5, JUN:6,
            JUL:7, AUG:8, SEP:9, OCT:10, NOV:11, DEC:12,
          }
          const key = m[2].substring(0, 3).toUpperCase()
          const mon = MONTH_MAP[key]
          if (mon !== undefined) {
            dobDate = new Date(parseInt(m[3]), mon - 1, parseInt(m[1]))
          } else {
            throw new Error(`Cannot parse DOB: "${dob}"`)
          }
        } else {
          throw new Error(`Cannot parse DOB: "${dob}"`)
        }
      }
    }
  }

  const year  = dobDate.getFullYear()
  const month = dobDate.getMonth() + 1   // 1-based
  const day   = dobDate.getDate()

  const yearStr = year.toString().padStart(4, "0")
  const Y1 = yearStr[2]
  const Y2 = yearStr[3]

  const DD        = day.toString().padStart(2, "0")
  const MM_male   = month.toString().padStart(2, "0")
  const MM_female = (month + 50).toString().padStart(2, "0")

  // ── 3. Initials ────────────────────────────────────────────────────────────
  const firstClean  = firstName.toUpperCase().replace(/[^A-Z]/g, "")
  const middleClean = (middleName ?? "").toUpperCase().replace(/[^A-Z]/g, "")

  const I1 = firstClean[0]  ?? "9"
  const I2 = middleClean[0] ?? "9"

  // ── 4. Build 13-char prefixes ──────────────────────────────────────────────
  const male   = surField + Y1 + MM_male   + DD + Y2 + I1 + I2
  const female = surField + Y1 + MM_female + DD + Y2 + I1 + I2

  return {
    surField,
    yearDigits: [Y1, Y2],
    dayField   : DD,
    initials   : [I1, I2],
    male,
    female,
  }
}

/**
 * Normalise a string for fuzzy comparison — handles the most common OCR
 * substitutions on alphanumeric characters:
 *   O ↔ 0    I ↔ 1    B ↔ 8    S ↔ 5    Z ↔ 2
 */
export function normaliseForComparison(s: string): string {
  return s.toUpperCase()
    .replace(/O/g, "0")
    .replace(/I/g, "1")
    .replace(/B/g, "8")
    .replace(/S/g, "5")
    .replace(/Z/g, "2")
}

/**
 * Compare the first 13 characters of a licence number against computed
 * prefixes.  Returns the match type or null if no match.
 *
 * Comparison is done after OCR-error normalisation so minor scan noise
 * (O/0, I/1, etc.) doesn't cause false failures.
 */
export function matchLicenceNumber(
  licenceNumber: string,
  result       : UKDLResult
): "male" | "female" | null {
  const scanned  = normaliseForComparison(licenceNumber.slice(0, 13))
  const malePfx  = normaliseForComparison(result.male)
  const femalePfx = normaliseForComparison(result.female)

  if (scanned === malePfx)   return "male"
  if (scanned === femalePfx) return "female"
  return null
}

/**
 * Count how many of the 13 prefix characters match (after normalisation).
 * Useful for showing a partial match score even when verification fails.
 */
export function prefixMatchScore(
  licenceNumber: string,
  result       : UKDLResult
): number {
  const scanned = normaliseForComparison(licenceNumber.slice(0, 13))
  const best    = [result.male, result.female]
    .map(p => normaliseForComparison(p))
    .map(p => {
      let matches = 0
      for (let i = 0; i < 13; i++) if (scanned[i] === p[i]) matches++
      return matches
    })
  return Math.max(...best)
}
