"use client"

import { useEffect, useRef, useState } from "react"
import { runPatternChecks, computeScore, type PatternCheckResult } from "@/lib/id-pattern-verifier"
import { extractIDData, type ExtractedIDData } from "@/lib/id-ocr"

interface Props {
  imageSrc: string
  onComplete: (passed: boolean, score: number, checks: PatternCheckResult[], ocrData: ExtractedIDData | null) => void
  onRetry: () => void
}

type CheckState = "pending" | "running" | "done"

interface CheckRow {
  result: PatternCheckResult
  state: CheckState
}

const TOTAL_CHECKS = 7

export default function IDPatternVerifier({ imageSrc, onComplete, onRetry }: Props) {
  const [rows, setRows] = useState<CheckRow[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [score, setScore] = useState<number | null>(null)
  const [finalPassed, setFinalPassed] = useState<boolean | null>(null)
  const [animatedScore, setAnimatedScore] = useState(0)
  const [uvMode, setUvMode] = useState(false)
  const [ocrData, setOcrData] = useState<ExtractedIDData | null>(null)
  const [ocrLoading, setOcrLoading] = useState(true)
  const ocrDataRef = useRef<ExtractedIDData | null>(null)

  // Run OCR in parallel with pattern checks
  useEffect(() => {
    let cancelled = false
    setOcrLoading(true)
    extractIDData(imageSrc).then((data) => {
      if (!cancelled) {
        ocrDataRef.current = data
        setOcrData(data)
        setOcrLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [imageSrc])

  useEffect(() => {
    let cancelled = false

    async function run() {
      const collected: PatternCheckResult[] = []
      let idx = 0

      for await (const check of runPatternChecks(imageSrc)) {
        if (cancelled) return

        collected.push(check)

        setRows((prev) => {
          const next = [...prev]
          // Mark previous as done
          if (next[idx - 1]) next[idx - 1] = { ...next[idx - 1], state: "done" }
          // Add current as running
          next[idx] = { result: check, state: "running" }
          return next
        })

        // Brief pause to show "running" state before resolving
        await new Promise((r) => setTimeout(r, 300))
        if (cancelled) return

        setRows((prev) => {
          const next = [...prev]
          if (next[idx]) next[idx] = { ...next[idx], state: "done" }
          return next
        })

        idx++
        setActiveIndex(idx)
      }

      if (cancelled) return

      const s = computeScore(collected)
      const passed = s >= 60

      setScore(s)
      setFinalPassed(passed)

      // Animate score bar
      let current = 0
      const step = Math.ceil(s / 30)
      const timer = setInterval(() => {
        current = Math.min(current + step, s)
        setAnimatedScore(current)
        if (current >= s) clearInterval(timer)
      }, 40)

      // Auto-proceed after 1.8s if passed
      if (passed) {
        setTimeout(() => {
          if (!cancelled) onComplete(true, s, collected, ocrDataRef.current)
        }, 1800)
      }
    }

    run()
    return () => { cancelled = true }
  }, [imageSrc, onComplete])

  const progress = Math.round((activeIndex / TOTAL_CHECKS) * 100)

  return (
    <div className="w-full max-w-sm mx-auto flex flex-col gap-4">
      {/* ID thumbnail */}
      <div className="relative rounded-xl overflow-hidden border border-[#334155]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageSrc}
          alt="Scanned ID"
          className="w-full object-cover transition-all duration-500"
          style={uvMode ? { filter: "brightness(0.15) saturate(8) hue-rotate(220deg) contrast(6)" } : undefined}
        />

        {/* UV active label */}
        {uvMode && (
          <div className="absolute inset-0 flex flex-col items-center justify-end pointer-events-none pb-2">
            <div className="px-3 py-1 rounded-full bg-[#7c3aed]/80 text-xs font-bold text-white tracking-widest shadow-lg shadow-purple-500/60">
              ◉ UV MODE ACTIVE
            </div>
          </div>
        )}

        {/* UV toggle button */}
        <button
          onClick={() => setUvMode((v) => !v)}
          className={`absolute top-2 right-2 px-2.5 py-1 rounded-lg text-xs font-bold tracking-wider transition-all duration-300 ${
            uvMode
              ? "bg-[#7c3aed] text-white shadow-lg shadow-purple-500/50 ring-1 ring-purple-400"
              : "bg-[#0f172a]/70 text-[#94a3b8] border border-[#334155] hover:border-[#7c3aed] hover:text-purple-400"
          }`}
        >
          UV
        </button>

        {/* Scan overlay — hide when UV mode is on */}
        {!uvMode && finalPassed === null && (
          <div className="absolute inset-0 bg-[#0f172a]/40 flex items-center justify-center">
            <div className="flex items-center gap-2 bg-[#0f172a]/80 px-3 py-1.5 rounded-full">
              <div className="w-2 h-2 bg-[#3b82f6] rounded-full animate-pulse" />
              <span className="text-xs text-white font-medium">Analysing document…</span>
            </div>
          </div>
        )}
        {!uvMode && finalPassed !== null && (
          <div className={`absolute inset-0 flex items-center justify-center ${finalPassed ? "bg-green-500/20" : "bg-red-500/20"}`}>
            <div className={`w-14 h-14 rounded-full flex items-center justify-center ${finalPassed ? "bg-green-500/30" : "bg-red-500/30"}`}>
              {finalPassed ? (
                <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Checks list */}
      <div className="bg-[#1e293b] border border-[#334155] rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[#334155] flex items-center justify-between">
          <span className="text-white text-sm font-semibold">Pattern Analysis</span>
          {finalPassed === null && (
            <span className="text-[#94a3b8] text-xs">{activeIndex}/{TOTAL_CHECKS}</span>
          )}
        </div>

        <div className="divide-y divide-[#334155]">
          {[
            { id: "quality",    name: "ID Colour Quality" },
            { id: "document",   name: "Document Detected" },
            { id: "photo",      name: "Photo Zone Present" },
            { id: "data",       name: "Data Zones Present" },
            { id: "pattern",    name: "Pattern Integrity" },
            { id: "uv",         name: "UV Pattern Check" },
            { id: "reference",  name: "Document Pattern Match" },
          ].map((template, i) => {
            const row = rows.find((r) => r.result.id === template.id)
            const state: CheckState = row ? row.state : "pending"
            const result = row?.result

            return (
              <div key={template.id} className="px-4 py-3 flex items-center gap-3">
                {/* Status icon */}
                <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
                  {state === "pending" && (
                    <div className="w-4 h-4 rounded-full border border-[#334155]" />
                  )}
                  {state === "running" && (
                    <div className="w-4 h-4 border-2 border-[#3b82f6] border-t-transparent rounded-full animate-spin" />
                  )}
                  {state === "done" && result?.passed && (
                    <div className="w-5 h-5 bg-green-500/20 rounded-full flex items-center justify-center">
                      <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                  {state === "done" && result && !result.passed && (
                    <div className="w-5 h-5 bg-red-500/20 rounded-full flex items-center justify-center">
                      <svg className="w-3 h-3 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium ${state === "pending" ? "text-[#475569]" : "text-white"}`}>
                    {template.name}
                  </div>
                  {state === "done" && result && (
                    <div className={`text-xs mt-0.5 truncate ${result.passed ? "text-green-400" : "text-red-400"}`}>
                      {result.detail}
                    </div>
                  )}
                  {state === "running" && (
                    <div className="text-xs text-[#3b82f6] mt-0.5">Checking…</div>
                  )}
                </div>

                {/* Weight badge */}
                <div className={`text-xs font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
                  state === "pending" ? "text-[#475569]" :
                  state === "running" ? "text-[#3b82f6]" :
                  result?.passed ? "text-green-400" : "text-red-400"
                }`}>
                  {[10, 15, 30, 25, 10, 20, 20][i]}%
                </div>
              </div>
            )
          })}
        </div>

        {/* Score bar */}
        {score !== null && (
          <div className="px-4 py-4 border-t border-[#334155]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-[#94a3b8] font-medium">Confidence Score</span>
              <span className={`text-lg font-extrabold ${finalPassed ? "text-green-400" : "text-red-400"}`}>
                {animatedScore}%
              </span>
            </div>
            <div className="h-2.5 bg-[#0f172a] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${finalPassed ? "bg-green-400" : "bg-red-400"}`}
                style={{ width: `${animatedScore}%` }}
              />
            </div>
            <div className={`text-xs font-bold mt-2 text-right ${finalPassed ? "text-green-400" : "text-red-400"}`}>
              {finalPassed ? "✓ DOCUMENT VERIFIED" : "✗ VERIFICATION FAILED"}
            </div>
          </div>
        )}
      </div>

      {/* Document Fields (OCR) */}
      <div className="bg-[#1e293b] border border-[#334155] rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[#334155] flex items-center justify-between">
          <span className="text-white text-sm font-semibold">Document Fields</span>
          {ocrLoading ? (
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 border-2 border-[#3b82f6] border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-[#3b82f6]">Reading…</span>
            </div>
          ) : (
            <span className="text-xs text-[#475569]">OCR</span>
          )}
        </div>

        {ocrLoading ? (
          <div className="px-4 py-4 flex flex-col gap-3">
            {[75, 60, 85, 50, 70].map((w, i) => (
              <div key={i} className="h-3 bg-[#334155] rounded-full animate-pulse" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : ocrData?.ocrFailed ? (
          <div className="px-4 py-5 text-center">
            <div className="text-xs text-red-400 font-medium">OCR failed to read this document</div>
            <div className="text-xs text-[#475569] mt-1">Try rescanning with better lighting and focus</div>
          </div>
        ) : (
          <div className="divide-y divide-[#334155]">

            {/* Full Name */}
            <div className="px-4 py-3 flex items-center justify-between gap-3">
              <span className="text-[#94a3b8] text-xs flex-shrink-0">Full Name</span>
              <span className={`text-sm font-medium text-right truncate ${ocrData?.fullName ? "text-white" : "text-[#475569]"}`}>
                {ocrData?.fullName ?? "Not detected"}
              </span>
            </div>

            {/* Document Number */}
            <div className="px-4 py-3 flex items-center justify-between gap-3">
              <span className="text-[#94a3b8] text-xs flex-shrink-0">Document No.</span>
              <span className={`text-sm font-medium font-mono ${ocrData?.documentNumber ? "text-white" : "text-[#475569]"}`}>
                {ocrData?.documentNumber ?? "Not detected"}
              </span>
            </div>

            {/* Date of Birth */}
            <div className="px-4 py-3 flex items-center justify-between gap-3">
              <span className="text-[#94a3b8] text-xs flex-shrink-0">Date of Birth</span>
              <span className={`text-sm font-medium ${ocrData?.dateOfBirth ? "text-white" : "text-[#475569]"}`}>
                {ocrData?.dateOfBirth ?? "Not detected"}
              </span>
            </div>

            {/* Expiry Date */}
            <div className="px-4 py-3 flex items-center justify-between gap-3">
              <span className="text-[#94a3b8] text-xs flex-shrink-0">Expiry Date</span>
              <span className={`text-sm font-medium ${ocrData?.expiryDate ? "text-white" : "text-[#475569]"}`}>
                {ocrData?.expiryDate ?? "Not detected"}
              </span>
            </div>

            {/* Nationality */}
            {ocrData?.nationality && (
              <div className="px-4 py-3 flex items-center justify-between gap-3">
                <span className="text-[#94a3b8] text-xs flex-shrink-0">Nationality</span>
                <span className="text-sm font-medium text-white">{ocrData.nationality}</span>
              </div>
            )}

            {/* Sex */}
            {ocrData?.sex && (
              <div className="px-4 py-3 flex items-center justify-between gap-3">
                <span className="text-[#94a3b8] text-xs flex-shrink-0">Sex</span>
                <span className="text-sm font-medium text-white">{ocrData.sex}</span>
              </div>
            )}

            {/* ID Status */}
            <div className="px-4 py-3 flex items-center justify-between gap-3">
              <span className="text-[#94a3b8] text-xs flex-shrink-0">ID Status</span>
              {ocrData?.expiryDate ? (
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                  ocrData.isExpired
                    ? "bg-red-500/20 text-red-400"
                    : "bg-green-500/20 text-green-400"
                }`}>
                  {ocrData.isExpired ? "✗ EXPIRED" : "✓ VALID"}
                </span>
              ) : (
                <span className="text-xs text-[#475569]">Unknown</span>
              )}
            </div>

            {/* MRZ Integrity */}
            {ocrData?.mrzValid !== null && ocrData?.mrzValid !== undefined && (
              <div className="px-4 py-3 flex items-center justify-between gap-3">
                <span className="text-[#94a3b8] text-xs flex-shrink-0">MRZ Integrity</span>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                  ocrData.mrzValid
                    ? "bg-green-500/20 text-green-400"
                    : "bg-red-500/20 text-red-400"
                }`}>
                  {ocrData.mrzValid ? "✓ CHECKSUMS VALID" : "✗ TAMPERED"}
                </span>
              </div>
            )}

            {/* Raw text fallback — shown when nothing was detected */}
            {!ocrData?.fullName && !ocrData?.documentNumber && !ocrData?.dateOfBirth && ocrData?.rawText && (
              <div className="px-4 py-3">
                <div className="text-[#94a3b8] text-xs mb-1.5">Raw OCR Text</div>
                <div className="text-xs text-[#475569] font-mono leading-relaxed whitespace-pre-wrap break-all max-h-24 overflow-y-auto">
                  {ocrData.rawText}
                </div>
              </div>
            )}

          </div>
        )}
      </div>

      {/* Actions — only shown on fail */}
      {finalPassed === false && (
        <div className="flex flex-col gap-3">
          <p className="text-[#94a3b8] text-xs text-center">
            {rows.filter(r => r.state === "done" && !r.result.passed).map(r => r.result.detail).join(" · ")}
          </p>
          <button
            onClick={onRetry}
            className="w-full border border-[#334155] hover:border-[#3b82f6] text-white text-sm font-semibold py-3 rounded-xl transition-colors"
          >
            Retake ID Scan
          </button>
          <button
            onClick={() => onComplete(false, score!, rows.map(r => r.result), ocrDataRef.current)}
            className="w-full text-[#475569] text-sm py-2"
          >
            Continue anyway
          </button>
        </div>
      )}

      {/* Auto-proceed hint on pass */}
      {finalPassed === true && (
        <div className="flex items-center justify-center gap-2 text-xs text-[#94a3b8]">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          Proceeding automatically…
        </div>
      )}
    </div>
  )
}
