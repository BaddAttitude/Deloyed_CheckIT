"use client"

import { useEffect, useState } from "react"
import { extractIDData } from "@/lib/id-ocr"
import { computeUKDLPrefix } from "@/lib/uk-dl-algorithm"
import type { ExtractedIDData } from "@/lib/id-ocr"
import type { PatternCheckResult } from "@/lib/check-types"

interface Props {
  imageSrc: string
  onComplete: (
    passed: boolean,
    score: number,
    checks: PatternCheckResult[],
    ocr: ExtractedIDData | null
  ) => void
  onRetry: () => void
}

type Stage = "ocr" | "review" | "algorithm" | "done"

interface ComputedData {
  expectedMale:   string
  expectedFemale: string
  hologram:       string
}

function formatHologram(expiryDate: string | null | undefined): string {
  if (!expiryDate) return "—"
  // expiryDate is stored as "14 Aug 2034" (en-GB locale from fmt())
  const parts = expiryDate.trim().split(/\s+/)
  if (parts.length !== 3) return "—"
  const [, mon, yyyy] = parts
  return `${mon.toUpperCase().slice(0, 3)} ${yyyy.slice(-2)}`
}

// ── Field row in the review screen ───────────────────────────────────────────
function FieldRow({
  label, value, required,
}: { label: string; value: string | null | undefined; required: boolean }) {
  const found = !!value
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#334155] last:border-0">
      <span className="text-[#94a3b8] text-xs font-mono flex-shrink-0">{label}</span>
      <div className="flex items-center gap-2 min-w-0">
        <span className={`text-sm font-medium truncate ${found ? "text-white" : "text-red-400"}`}>
          {value ?? "Not found"}
        </span>
        <div className={`w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center ${
          found ? "bg-green-500/20" : required ? "bg-red-500/20" : "bg-[#334155]"
        }`}>
          {found ? (
            <svg className="w-2.5 h-2.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className={`w-2.5 h-2.5 ${required ? "text-red-400" : "text-[#475569]"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function UKDLVerifier({ imageSrc, onComplete, onRetry }: Props) {
  const [stage,    setStage]    = useState<Stage>("ocr")
  const [ocrData,  setOcrData]  = useState<ExtractedIDData | null>(null)
  const [passed,   setPassed]   = useState(false)
  const [score,    setScore]    = useState(0)
  const [computed, setComputed] = useState<ComputedData | null>(null)
  const [error,    setError]    = useState("")

  // ── Step 1: OCR ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function runOCR() {
      try {
        setStage("ocr")
        const ocr = await extractIDData(imageSrc)
        if (cancelled) return

        if (ocr.ocrFailed) {
          setError("OCR failed — could not read the document. Please retake.")
          setStage("done")
          return
        }

        setOcrData(ocr)
        setStage("review")   // pause for user to confirm
      } catch (err) {
        if (cancelled) return
        setError(`OCR error: ${err instanceof Error ? err.message : "unknown"}`)
        setStage("done")
      }
    }

    runOCR()
    return () => { cancelled = true }
  }, [imageSrc]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Step 2: Algorithm (triggered when user confirms) ─────────────────────────
  useEffect(() => {
    if (stage !== "algorithm" || !ocrData) return
    let cancelled = false

    async function runAlgorithm() {
      try {
        const ocr = ocrData!
        const checks: PatternCheckResult[] = []

        checks.push({ id: "surname", name: "Surname (field 1)",      passed: !!ocr.surname,      detail: ocr.surname      ?? "Not found", weight: 20 })
        checks.push({ id: "given",   name: "Given names (field 2)",   passed: !!ocr.firstName,    detail: [ocr.firstName, ocr.middleName].filter(Boolean).join(" ") || "Not found", weight: 20 })
        checks.push({ id: "dob",     name: "Date of birth (field 3)", passed: !!ocr.dateOfBirth,  detail: ocr.dateOfBirth  ?? "Not found", weight: 20 })
        checks.push({ id: "issue",   name: "Issue date (field 4a)",   passed: !!ocr.issueDate,    detail: ocr.issueDate    ?? "Not found", weight: 20 })

        const notExpired = !!ocr.expiryDate && ocr.isExpired === false
        checks.push({
          id: "expiry", name: "Expiry date (field 4b)", passed: notExpired,
          detail: ocr.expiryDate ? `${ocr.expiryDate}${ocr.isExpired ? " — EXPIRED" : " — valid"}` : "Not found",
          weight: 20,
        })

        const REQUIRED = 5
        const allFieldsFound = !!ocr.surname && !!ocr.firstName && !!ocr.dateOfBirth
        let algorithmPassed = false
        let finalScore      = 0
        let computedData: ComputedData | null = null

        if (allFieldsFound) {
          try {
            const dlResult = computeUKDLPrefix(ocr.surname!, ocr.firstName!, ocr.middleName, ocr.dateOfBirth!)
            algorithmPassed = notExpired
            finalScore      = algorithmPassed
              ? 100
              : Math.round((checks.filter(c => c.id !== "algorithm" && c.passed).length / REQUIRED) * 100)
            computedData = { expectedMale: dlResult.male, expectedFemale: dlResult.female, hologram: formatHologram(ocr.expiryDate) }
            checks.push({ id: "algorithm", name: "Algorithm computed", passed: true,
              detail: `${dlResult.male} (standard) · ${dlResult.female} (female variant)`, weight: 0 })
          } catch (e) {
            checks.push({ id: "algorithm", name: "Algorithm computed", passed: false,
              detail: `Error: ${e instanceof Error ? e.message : "unknown"}`, weight: 0 })
            finalScore = Math.round((checks.filter(c => c.id !== "algorithm" && c.passed).length / REQUIRED) * 100)
          }
        } else {
          checks.push({ id: "algorithm", name: "Algorithm computed", passed: false,
            detail: "Cannot run — required fields missing", weight: 0 })
          finalScore = Math.round((checks.filter(c => c.id !== "algorithm" && c.passed).length / REQUIRED) * 100)
        }

        if (cancelled) return

        setPassed(algorithmPassed)
        setScore(finalScore)
        setComputed(computedData)
        setStage("done")

        await new Promise(r => setTimeout(r, 1800))
        if (!cancelled) onComplete(algorithmPassed, finalScore, checks, ocr)

      } catch (err) {
        if (cancelled) return
        setError(`Verification failed: ${err instanceof Error ? err.message : "unknown"}`)
        setStage("done")
      }
    }

    runAlgorithm()
    return () => { cancelled = true }
  }, [stage]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Error state ──────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex flex-col gap-4 w-full max-w-sm">
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-xl">{error}</div>
        <button onClick={onRetry} className="w-full bg-[#3b82f6] hover:bg-[#2563eb] text-white font-semibold py-3 rounded-xl transition-colors">
          Try Again
        </button>
      </div>
    )
  }

  // ── OCR loading ──────────────────────────────────────────────────────────────
  if (stage === "ocr") {
    return (
      <div className="flex flex-col items-center gap-6 py-12 w-full">
        <div className="w-12 h-12 border-2 border-[#3b82f6] border-t-transparent rounded-full animate-spin" />
        <div className="text-center">
          <p className="text-white font-semibold">Reading document…</p>
          <p className="text-[#94a3b8] text-sm mt-1">Extracting fields 1, 2, 3, 4a and 4b</p>
        </div>
      </div>
    )
  }

  // ── OCR Review — confirm before algorithm runs ───────────────────────────────
  if (stage === "review" && ocrData) {
    const givenNames = [ocrData.firstName, ocrData.middleName].filter(Boolean).join(" ") || null
    const canContinue = !!ocrData.surname && !!ocrData.firstName && !!ocrData.dateOfBirth

    return (
      <div className="flex flex-col gap-4 w-full max-w-sm">

        {/* Header */}
        <div className="text-center">
          <p className="text-white font-semibold">Check extracted fields</p>
          <p className="text-[#94a3b8] text-sm mt-1">
            Confirm the data below is correct before verifying
          </p>
        </div>

        {/* Thumbnail */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageSrc} alt="Captured ID" className="w-full rounded-xl border border-[#334155] object-cover max-h-36" />

        {/* Field rows */}
        <div className="bg-[#1e293b] border border-[#334155] rounded-2xl overflow-hidden">
          <FieldRow label="1. Surname"      value={ocrData.surname}    required={true}  />
          <FieldRow label="2. Given names"  value={givenNames}         required={true}  />
          <FieldRow label="3. Date of birth" value={ocrData.dateOfBirth} required={true} />
          <FieldRow label="4a. Issue date"  value={ocrData.issueDate}  required={false} />
          <FieldRow label="4b. Expiry date" value={ocrData.expiryDate} required={false} />
        </div>

        {!canContinue && (
          <p className="text-red-400 text-xs text-center">
            Fields 1, 2 and 3 are required — retake for a clearer shot
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onRetry}
            className="flex-1 bg-[#1e293b] border border-[#334155] hover:border-[#3b82f6]/60 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            Retake
          </button>
          <button
            onClick={() => setStage("algorithm")}
            disabled={!canContinue}
            className="flex-1 bg-[#3b82f6] hover:bg-[#2563eb] text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Looks good →
          </button>
        </div>
      </div>
    )
  }

  // ── Algorithm running ────────────────────────────────────────────────────────
  if (stage === "algorithm") {
    return (
      <div className="flex flex-col items-center gap-6 py-12 w-full">
        <div className="w-12 h-12 border-2 border-[#3b82f6] border-t-transparent rounded-full animate-spin" />
        <div className="text-center">
          <p className="text-white font-semibold">Running algorithm…</p>
          <p className="text-[#94a3b8] text-sm mt-1">Computing expected licence number</p>
        </div>
      </div>
    )
  }

  // ── Done ─────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col items-center gap-4 py-8 w-full">
      <div className={`w-16 h-16 rounded-full flex items-center justify-center ${passed ? "bg-green-400/20" : "bg-red-400/20"}`}>
        {passed ? (
          <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ) : (
          <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
      </div>

      <div className="text-center">
        <p className={`text-xl font-bold ${passed ? "text-green-400" : "text-red-400"}`}>
          {passed ? "Fields Verified" : "Scan Failed"}
        </p>
        <p className="text-[#94a3b8] text-sm mt-1">
          {passed ? "All fields read · licence number computed" : "Could not verify — licence may be expired or fields unreadable"}
        </p>
      </div>

      {computed && (
        <div className="w-full bg-[#1e293b] border border-[#334155] rounded-xl px-4 py-3 space-y-2">
          <p className="text-[#94a3b8] text-xs font-medium mb-1">Expected licence number</p>
          <div className="flex justify-between items-center gap-2">
            <span className="text-[#475569] text-xs">Male:</span>
            <span className="text-white text-sm font-mono tracking-widest">{computed.expectedMale}</span>
          </div>
          <div className="flex justify-between items-center gap-2">
            <span className="text-[#475569] text-xs">Female:</span>
            <span className="text-white text-sm font-mono tracking-widest">{computed.expectedFemale}</span>
          </div>
          <div className="flex justify-between items-center gap-2">
            <span className="text-[#475569] text-xs">Hologram:</span>
            <span className="text-[#a855f7] text-sm font-mono tracking-widest">{computed.hologram}</span>
          </div>
        </div>
      )}

      <p className="text-[#475569] text-xs">Proceeding to result…</p>
    </div>
  )
}
