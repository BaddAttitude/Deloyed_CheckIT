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

type Stage = "ocr" | "algorithm" | "done"

interface ComputedData {
  expectedMale:   string
  expectedFemale: string
}

export default function UKDLVerifier({ imageSrc, onComplete, onRetry }: Props) {
  const [stage,    setStage]    = useState<Stage>("ocr")
  const [passed,   setPassed]   = useState(false)
  const [score,    setScore]    = useState(0)
  const [computed, setComputed] = useState<ComputedData | null>(null)
  const [error,    setError]    = useState("")

  useEffect(() => {
    let cancelled = false

    async function run() {
      try {
        // ── Step 1: OCR ────────────────────────────────────────────────────
        setStage("ocr")
        const ocr = await extractIDData(imageSrc)
        if (cancelled) return

        // ── Step 2: Algorithm ──────────────────────────────────────────────
        setStage("algorithm")

        const checks: PatternCheckResult[] = []

        checks.push({
          id:     "surname",
          name:   "Surname (field 1)",
          passed: !!ocr.surname,
          detail: ocr.surname ?? "Not found",
          weight: 20,
        })
        checks.push({
          id:     "given",
          name:   "Given names (field 2)",
          passed: !!ocr.firstName,
          detail: [ocr.firstName, ocr.middleName].filter(Boolean).join(" ") || "Not found",
          weight: 20,
        })
        checks.push({
          id:     "dob",
          name:   "Date of birth (field 3)",
          passed: !!ocr.dateOfBirth,
          detail: ocr.dateOfBirth ?? "Not found",
          weight: 20,
        })
        checks.push({
          id:     "issue",
          name:   "Issue date (field 4a)",
          passed: !!ocr.issueDate,
          detail: ocr.issueDate ?? "Not found",
          weight: 20,
        })

        // Field 4b — expiry: must be found AND not expired
        const notExpired = !!ocr.expiryDate && ocr.isExpired === false
        checks.push({
          id:     "expiry",
          name:   "Expiry date (field 4b)",
          passed: notExpired,
          detail: ocr.expiryDate
            ? `${ocr.expiryDate}${ocr.isExpired ? " — EXPIRED" : " — valid"}`
            : "Not found",
          weight: 20,
        })

        const REQUIRED_FIELDS = 5
        const allFieldsFound = !!ocr.surname && !!ocr.firstName && !!ocr.dateOfBirth
        let algorithmPassed  = false
        let finalScore       = 0
        let computedData: ComputedData | null = null

        if (allFieldsFound) {
          try {
            const dlResult = computeUKDLPrefix(
              ocr.surname!,
              ocr.firstName!,
              ocr.middleName,
              ocr.dateOfBirth!
            )

            // Pass only if expired check also passes
            algorithmPassed = notExpired
            finalScore      = algorithmPassed ? 100 : Math.round(
              (checks.filter(c => c.id !== "algorithm" && c.passed).length / REQUIRED_FIELDS) * 100
            )
            computedData    = {
              expectedMale:   dlResult.male,
              expectedFemale: dlResult.female,
            }

            checks.push({
              id:     "algorithm",
              name:   "Algorithm computed",
              passed: true,
              detail: `${dlResult.male} (standard) · ${dlResult.female} (female variant)`,
              weight: 0,
            })
          } catch (e) {
            checks.push({
              id:     "algorithm",
              name:   "Algorithm computed",
              passed: false,
              detail: `Error: ${e instanceof Error ? e.message : "unknown"}`,
              weight: 0,
            })
            finalScore = Math.round(
              (checks.filter(c => c.id !== "algorithm" && c.passed).length / REQUIRED_FIELDS) * 100
            )
          }
        } else {
          checks.push({
            id:     "algorithm",
            name:   "Algorithm computed",
            passed: false,
            detail: "Cannot run — required fields missing from scan",
            weight: 0,
          })
          finalScore = Math.round(
            (checks.filter(c => c.id !== "algorithm" && c.passed).length / REQUIRED_FIELDS) * 100
          )
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
        setError(`Verification failed: ${err instanceof Error ? err.message : "unknown error"}`)
        setStage("done")
      }
    }

    run()
    return () => { cancelled = true }
  }, [imageSrc]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex flex-col gap-4 w-full max-w-sm">
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-xl">
          {error}
        </div>
        <button
          onClick={onRetry}
          className="w-full bg-[#3b82f6] hover:bg-[#2563eb] text-white font-semibold py-3 rounded-xl transition-colors"
        >
          Try Again
        </button>
      </div>
    )
  }

  // ── Processing ─────────────────────────────────────────────────────────────
  if (stage !== "done") {
    return (
      <div className="flex flex-col items-center gap-6 py-12 w-full">
        <div className="w-12 h-12 border-2 border-[#3b82f6] border-t-transparent rounded-full animate-spin" />
        <div className="text-center">
          <p className="text-white font-semibold">
            {stage === "ocr" ? "Reading document…" : "Running algorithm…"}
          </p>
          <p className="text-[#94a3b8] text-sm mt-1">
            {stage === "ocr"
              ? "Extracting fields 1, 2, 3, 4a and 4b"
              : "Computing expected licence number"}
          </p>
        </div>
        <div className="flex flex-col gap-2.5 w-full max-w-xs">
          {(["ocr", "algorithm"] as const).map((s) => {
            const done  = s === "ocr" && stage === "algorithm"
            const label = s === "ocr" ? "OCR scan" : "Algorithm check"
            return (
              <div key={s} className="flex items-center gap-3 text-sm">
                {done ? (
                  <div className="w-5 h-5 bg-green-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                ) : (
                  <div className="w-5 h-5 border border-[#334155] rounded-full flex-shrink-0" />
                )}
                <span className={done ? "text-white" : "text-[#475569]"}>{label}</span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Done ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col items-center gap-4 py-8 w-full">
      <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
        passed ? "bg-green-400/20" : "bg-red-400/20"
      }`}>
        {passed ? (
          <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ) : (
          <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
              d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
      </div>

      <div className="text-center">
        <p className={`text-xl font-bold ${passed ? "text-green-400" : "text-red-400"}`}>
          {passed ? "Fields Verified" : "Scan Failed"}
        </p>
        <p className="text-[#94a3b8] text-sm mt-1">
          {passed
            ? "All fields read · licence number computed"
            : "Could not read all required fields or licence is expired — please retry"}
        </p>
      </div>

      {computed && (
        <div className="w-full bg-[#1e293b] border border-[#334155] rounded-xl px-4 py-3 space-y-2">
          <p className="text-[#94a3b8] text-xs font-medium mb-1">Expected licence number</p>
          <div className="flex justify-between items-center gap-2">
            <span className="text-[#475569] text-xs">Standard:</span>
            <span className="text-white text-sm font-mono tracking-widest">{computed.expectedMale}</span>
          </div>
          <div className="flex justify-between items-center gap-2">
            <span className="text-[#475569] text-xs">Female variant:</span>
            <span className="text-white text-sm font-mono tracking-widest">{computed.expectedFemale}</span>
          </div>
        </div>
      )}

      <p className="text-[#475569] text-xs">Proceeding to result…</p>
    </div>
  )
}
