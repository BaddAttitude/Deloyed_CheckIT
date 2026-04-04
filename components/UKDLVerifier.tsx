"use client"

import { useEffect, useState } from "react"
import { extractIDData } from "@/lib/id-ocr"
import {
  computeUKDLPrefix,
  matchLicenceNumber,
  prefixMatchScore,
} from "@/lib/uk-dl-algorithm"
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
  expectedMale:  string
  expectedFemale: string
  scanned:       string
  matchType:     "male" | "female" | null
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
          id: "surname",
          name: "Surname (field 1)",
          passed: !!ocr.surname,
          detail: ocr.surname ?? "Not found on document",
          weight: 20,
        })
        checks.push({
          id: "given",
          name: "Given names (field 2)",
          passed: !!ocr.firstName,
          detail:
            [ocr.firstName, ocr.middleName].filter(Boolean).join(" ") ||
            "Not found on document",
          weight: 20,
        })
        checks.push({
          id: "dob",
          name: "Date of birth (field 3)",
          passed: !!ocr.dateOfBirth,
          detail: ocr.dateOfBirth ?? "Not found on document",
          weight: 20,
        })
        checks.push({
          id: "licence",
          name: "Licence number (field 4d)",
          passed: !!ocr.licenceNumber,
          detail: ocr.licenceNumber ?? "Not found on document",
          weight: 20,
        })

        let algorithmPassed = false
        let finalScore      = 0
        let computedData: ComputedData | null = null

        const canRun =
          ocr.surname && ocr.firstName && ocr.dateOfBirth && ocr.licenceNumber

        if (canRun) {
          try {
            const dlResult = computeUKDLPrefix(
              ocr.surname!,
              ocr.firstName!,
              ocr.middleName,
              ocr.dateOfBirth!
            )
            const matchType = matchLicenceNumber(ocr.licenceNumber!, dlResult)
            const charScore = prefixMatchScore(ocr.licenceNumber!, dlResult)

            algorithmPassed = matchType !== null
            finalScore      = algorithmPassed
              ? 100
              : Math.round((charScore / 13) * 100)

            computedData = {
              expectedMale:   dlResult.male,
              expectedFemale: dlResult.female,
              scanned:        ocr.licenceNumber!.slice(0, 13).toUpperCase(),
              matchType,
            }

            checks.push({
              id: "algorithm",
              name: "Algorithm verification",
              passed: algorithmPassed,
              detail: algorithmPassed
                ? `Matched — ${matchType === "female" ? "female variant" : "standard variant"}`
                : `Expected ${dlResult.male} · got ${ocr.licenceNumber!.slice(0, 13).toUpperCase()}`,
              weight: 20,
            })
          } catch (e) {
            checks.push({
              id: "algorithm",
              name: "Algorithm verification",
              passed: false,
              detail: `Error: ${e instanceof Error ? e.message : "unknown"}`,
              weight: 20,
            })
          }
        } else {
          checks.push({
            id: "algorithm",
            name: "Algorithm verification",
            passed: false,
            detail: "Cannot run — required fields missing",
            weight: 20,
          })
          // Partial score based on how many fields were found (max 60%)
          finalScore = Math.round(
            (checks.filter(c => c.id !== "algorithm" && c.passed).length / 4) * 60
          )
        }

        if (cancelled) return

        setPassed(algorithmPassed)
        setScore(finalScore)
        setComputed(computedData)
        setStage("done")

        // Brief display pause before proceeding to result screen
        await new Promise(r => setTimeout(r, 1500))
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

  // ── Error state ────────────────────────────────────────────────────────────
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

  // ── Processing state ───────────────────────────────────────────────────────
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
              ? "Extracting fields from licence"
              : "Computing expected licence number"}
          </p>
        </div>
        <div className="flex flex-col gap-2.5 w-full max-w-xs">
          {(["ocr", "algorithm"] as Stage[]).map((s) => {
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

  // ── Done: brief result display ─────────────────────────────────────────────
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
          {passed ? "Algorithm Matched" : "No Match"}
        </p>
        <p className="text-[#94a3b8] text-sm mt-1">
          {passed
            ? `Licence verified — ${computed?.matchType === "female" ? "female variant" : "standard variant"}`
            : "Licence number did not match computed value"}
        </p>
      </div>

      {computed && (
        <div className="w-full bg-[#1e293b] border border-[#334155] rounded-xl px-4 py-3 space-y-1.5 text-xs font-mono">
          <div className="flex justify-between gap-2">
            <span className="text-[#94a3b8]">Expected (M):</span>
            <span className="text-white tracking-wide">{computed.expectedMale}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-[#94a3b8]">Expected (F):</span>
            <span className="text-white tracking-wide">{computed.expectedFemale}</span>
          </div>
          <div className="border-t border-[#334155] pt-1.5 flex justify-between gap-2">
            <span className="text-[#94a3b8]">Scanned (13ch):</span>
            <span className={`tracking-wide ${computed.matchType ? "text-green-400" : "text-red-400"}`}>
              {computed.scanned}
            </span>
          </div>
        </div>
      )}

      <p className="text-[#475569] text-xs">Proceeding to result…</p>
    </div>
  )
}
