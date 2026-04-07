"use client"

import type { PatternCheckResult } from "@/lib/check-types"
import type { ExtractedIDData } from "@/lib/id-ocr"

interface VerificationResultProps {
  result: "passed" | "failed"
  idType: string
  scanMode: "one" | "two"
  distance?: number
  patternScore?: number
  patternChecks?: PatternCheckResult[]
  ocrData?: ExtractedIDData | null
  onReset: () => void
}

export default function VerificationResult({
  result,
  idType,
  scanMode,
  distance,
  patternScore,
  patternChecks,
  ocrData,
  onReset,
}: VerificationResultProps) {
  const isPassed = result === "passed"
  const matchPct = distance !== undefined ? Math.min(100, Math.max(0, Math.round((1 - distance) * 100))) : undefined
  const now = new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })

  return (
    <div className="flex flex-col gap-4 w-full max-w-sm mx-auto">

      {/* ── Hero ── */}
      <div className={`flex flex-col items-center gap-3 py-7 rounded-2xl border ${
        isPassed
          ? "bg-green-500/5 border-green-500/20"
          : "bg-red-500/5 border-red-500/20"
      }`}>
        <div className={`w-20 h-20 rounded-full flex items-center justify-center ${
          isPassed ? "bg-green-400/20" : "bg-red-400/20"
        }`}>
          {isPassed ? (
            <svg className="w-10 h-10 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg className="w-10 h-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
        </div>
        <div className="text-center">
          <div className={`text-3xl font-extrabold tracking-wide ${isPassed ? "text-green-400" : "text-red-400"}`}>
            {isPassed ? "VERIFIED" : "UNVERIFIED"}
          </div>
          <p className="text-[#94a3b8] text-sm mt-1">
            {isPassed
              ? scanMode === "two" ? "ID valid · Face matched" : "ID document verified"
              : scanMode === "two" ? "ID invalid or face mismatch" : "Could not verify ID document"}
          </p>
        </div>
      </div>

      {/* ── Document Score ── */}
      {patternScore !== undefined && (
        <div className="bg-[#1e293b] border border-[#334155] rounded-2xl px-4 py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white text-sm font-semibold">Document Score</span>
            <span className={`text-xl font-extrabold ${patternScore >= 60 ? "text-green-400" : "text-red-400"}`}>
              {patternScore}%
            </span>
          </div>
          <div className="h-2.5 bg-[#0f172a] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${patternScore >= 60 ? "bg-green-400" : "bg-red-400"}`}
              style={{ width: `${patternScore}%` }}
            />
          </div>
          <div className={`text-xs font-bold mt-2 text-right ${patternScore >= 60 ? "text-green-400" : "text-red-400"}`}>
            {patternScore >= 60 ? "ABOVE THRESHOLD" : "BELOW THRESHOLD"} (min 60%)
          </div>
        </div>
      )}

      {/* ── Pattern Analysis Breakdown ── */}
      {patternChecks && patternChecks.length > 0 && (
        <div className="bg-[#1e293b] border border-[#334155] rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[#334155] flex items-center justify-between">
            <span className="text-white text-sm font-semibold">Pattern Analysis</span>
            <span className="text-[#94a3b8] text-xs">
              {patternChecks.filter(c => c.passed).length}/{patternChecks.length} passed
            </span>
          </div>
          <div className="divide-y divide-[#334155]">
            {patternChecks.map((check) => (
              <div key={check.id} className="px-4 py-3 flex items-start gap-3">
                {/* Icon */}
                <div className="flex-shrink-0 mt-0.5">
                  {check.passed ? (
                    <div className="w-5 h-5 bg-green-500/20 rounded-full flex items-center justify-center">
                      <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  ) : (
                    <div className="w-5 h-5 bg-red-500/20 rounded-full flex items-center justify-center">
                      <svg className="w-3 h-3 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                  )}
                </div>
                {/* Text */}
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm font-medium">{check.name}</div>
                  <div className={`text-xs mt-0.5 truncate ${check.passed ? "text-green-400" : "text-red-400"}`}>
                    {check.detail}
                  </div>
                </div>
                {/* Weight */}
                <span className={`text-xs font-bold flex-shrink-0 mt-0.5 ${check.passed ? "text-green-400" : "text-[#475569]"}`}>
                  {check.weight}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Document Fields (OCR) ── */}
      {ocrData && !ocrData.ocrFailed && (
        <div className="bg-[#1e293b] border border-[#334155] rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[#334155]">
            <span className="text-white text-sm font-semibold">Document Fields</span>
          </div>
          <div className="divide-y divide-[#334155]">
            {ocrData.fullName && (
              <div className="px-4 py-3 flex items-center justify-between gap-3">
                <span className="text-[#94a3b8] text-xs flex-shrink-0">Full Name</span>
                <span className="text-white text-sm font-medium text-right truncate">{ocrData.fullName}</span>
              </div>
            )}
            {ocrData.documentNumber && (
              <div className="px-4 py-3 flex items-center justify-between gap-3">
                <span className="text-[#94a3b8] text-xs flex-shrink-0">Document No.</span>
                <span className="text-white text-sm font-medium font-mono">{ocrData.documentNumber}</span>
              </div>
            )}
            {ocrData.dateOfBirth && (
              <div className="px-4 py-3 flex items-center justify-between gap-3">
                <span className="text-[#94a3b8] text-xs flex-shrink-0">Date of Birth</span>
                <span className="text-white text-sm font-medium">{ocrData.dateOfBirth}</span>
              </div>
            )}
            {ocrData.issueDate && (
              <div className="px-4 py-3 flex items-center justify-between gap-3">
                <span className="text-[#94a3b8] text-xs flex-shrink-0">Issue Date</span>
                <span className="text-white text-sm font-medium">{ocrData.issueDate}</span>
              </div>
            )}
            {ocrData.expiryDate && (
              <div className="px-4 py-3 flex items-center justify-between gap-3">
                <span className="text-[#94a3b8] text-xs flex-shrink-0">Expiry Date</span>
                <span className="text-white text-sm font-medium">{ocrData.expiryDate}</span>
              </div>
            )}
            {ocrData.nationality && (
              <div className="px-4 py-3 flex items-center justify-between gap-3">
                <span className="text-[#94a3b8] text-xs flex-shrink-0">Nationality</span>
                <span className="text-white text-sm font-medium">{ocrData.nationality}</span>
              </div>
            )}
            {ocrData.sex && (
              <div className="px-4 py-3 flex items-center justify-between gap-3">
                <span className="text-[#94a3b8] text-xs flex-shrink-0">Sex</span>
                <span className="text-white text-sm font-medium">{ocrData.sex}</span>
              </div>
            )}
            {ocrData.expiryDate && (
              <div className="px-4 py-3 flex items-center justify-between gap-3">
                <span className="text-[#94a3b8] text-xs flex-shrink-0">ID Status</span>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                  ocrData.isExpired
                    ? "bg-red-500/20 text-red-400"
                    : "bg-green-500/20 text-green-400"
                }`}>
                  {ocrData.isExpired ? "✗ EXPIRED" : "✓ VALID"}
                </span>
              </div>
            )}
            {ocrData.mrzValid !== null && ocrData.mrzValid !== undefined && (
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
          </div>
        </div>
      )}

      {/* ── Biometric Match ── */}
      {scanMode === "two" && matchPct !== undefined && (
        <div className="bg-[#1e293b] border border-[#334155] rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[#334155]">
            <span className="text-white text-sm font-semibold">Biometric Match</span>
          </div>
          <div className="px-4 py-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[#94a3b8] text-xs">Face similarity</span>
              <span className={`text-xl font-extrabold ${
                matchPct >= 60 ? "text-green-400" : matchPct >= 50 ? "text-orange-400" : "text-red-400"
              }`}>
                {matchPct}%
              </span>
            </div>
            <div className="h-2.5 bg-[#0f172a] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  matchPct >= 60 ? "bg-green-400" : matchPct >= 50 ? "bg-orange-400" : "bg-red-400"
                }`}
                style={{ width: `${matchPct}%` }}
              />
            </div>
            <div className={`text-xs font-bold mt-2 ${
              matchPct >= 60 ? "text-green-400" : matchPct >= 50 ? "text-orange-400" : "text-red-400"
            }`}>
              {matchPct >= 60
                ? "Strong match — likely same person"
                : matchPct >= 50
                ? "Good similarity — discretion advised"
                : "Too weak — different person"}
            </div>
          </div>
        </div>
      )}

      {/* ── Scan Details ── */}
      <div className="bg-[#1e293b] border border-[#334155] rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[#334155]">
          <span className="text-white text-sm font-semibold">Scan Details</span>
        </div>
        <div className="divide-y divide-[#334155]">
          <div className="px-4 py-3 flex items-center justify-between">
            <span className="text-[#94a3b8] text-xs">Document Type</span>
            <span className="text-white text-sm font-medium">{idType}</span>
          </div>
          <div className="px-4 py-3 flex items-center justify-between">
            <span className="text-[#94a3b8] text-xs">Verification Mode</span>
            <span className="text-white text-sm font-medium">
              {scanMode === "one" ? "ID Scan" : "Biometric Scan"}
            </span>
          </div>
          <div className="px-4 py-3 flex items-center justify-between">
            <span className="text-[#94a3b8] text-xs">Completed At</span>
            <span className="text-white text-sm font-medium">{now}</span>
          </div>
        </div>
      </div>

      {/* ── Action ── */}
      <button
        onClick={onReset}
        className="w-full bg-[#3b82f6] hover:bg-[#2563eb] text-white font-semibold py-3.5 rounded-xl transition-colors"
      >
        Scan Next Person
      </button>

    </div>
  )
}
