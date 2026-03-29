"use client"

import { useState, useCallback } from "react"
import Link from "next/link"
import ScanModeSelector from "@/components/ScanModeSelector"
import CameraScanner from "@/components/CameraScanner"
import FaceScanner from "@/components/FaceScanner"
import IDFaceScanner from "@/components/IDFaceScanner"
import IDPatternVerifier from "@/components/IDPatternVerifier"
import VerificationResult from "@/components/VerificationResult"
import {
  compareFaceDescriptors,
  MATCH_THRESHOLD,
} from "@/lib/face-api-loader"
import type { PatternCheckResult } from "@/lib/id-pattern-verifier"
import type { ExtractedIDData } from "@/lib/id-ocr"

type Step = "setup" | "id-scan" | "pattern-verify" | "id-face-scan" | "face-scan" | "result"

interface Props {
  company: string
  initialMode: "one" | "two"
}

export default function VerifyClient({ company, initialMode }: Props) {
  const [step, setStep] = useState<Step>("setup")
  const [idType, setIdType] = useState("Passport")
  const [scanMode, setScanMode] = useState<"one" | "two">(initialMode)
  const [idImageSrc, setIdImageSrc] = useState<string | null>(null)
  const [faceDescriptorFromId, setFaceDescriptorFromId] = useState<Float32Array | null>(null)
  const [idFaceCrop, setIdFaceCrop] = useState<string | null>(null)
  const [result, setResult] = useState<"passed" | "failed" | null>(null)
  const [distance, setDistance] = useState<number | undefined>(undefined)
  const [patternScore, setPatternScore] = useState<number | undefined>(undefined)
  const [patternChecks, setPatternChecks] = useState<PatternCheckResult[]>([])
  const [ocrData, setOcrData] = useState<ExtractedIDData | null>(null)
  const [statusMsg, setStatusMsg] = useState("")
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState("")

  const reset = useCallback(() => {
    setStep("setup")
    setIdImageSrc(null)
    setFaceDescriptorFromId(null)
    setIdFaceCrop(null)
    setResult(null)
    setDistance(undefined)
    setPatternScore(undefined)
    setPatternChecks([])
    setOcrData(null)
    setStatusMsg("")
    setError("")
    setProcessing(false)
  }, [])

  // One-scan step 1: full ID captured → pattern verification
  const handleIdCapture = useCallback((imageSrc: string) => {
    setIdImageSrc(imageSrc)
    setError("")
    setStep("pattern-verify")
  }, [])

  // Two-scan step 1: face on ID captured → store descriptor + crop, go to live scan
  const handleIdFaceCapture = useCallback((imageSrc: string, descriptor: Float32Array, cropPixels: string) => {
    setIdImageSrc(imageSrc)
    setFaceDescriptorFromId(descriptor)
    setIdFaceCrop(cropPixels)
    setStep("face-scan")
  }, [])

  // One-scan step 2: pattern verifier done
  const handlePatternComplete = useCallback(
    async (passed: boolean, score: number, checks: PatternCheckResult[], ocr: ExtractedIDData | null) => {
      setPatternScore(score)
      setPatternChecks(checks)
      setOcrData(ocr)

      const finalResult: "passed" | "failed" = passed ? "passed" : "failed"
      setResult(finalResult)
      await logVerification(idType, scanMode, finalResult)
      setStep("result")
    },
    [idType, scanMode]
  )

  // Step 3: Live face captured → hybrid biometric comparison
  const handleFaceCapture = useCallback(
    async (_imageSrc: string, liveDescriptor: Float32Array, liveCrop: string) => {
      if (!faceDescriptorFromId) return
      setProcessing(true)
      setStatusMsg("Comparing faces…")

      // ── Client-side MobileFaceNet distance ────────────────────────────────
      const clientDist = compareFaceDescriptors(faceDescriptorFromId, liveDescriptor)
      let finalDist    = clientDist

      // ── Hybrid: escalate ambiguous cases to server-side ArcFace R50 ───────
      // Confident pass  : clientDist < 0.25 (matchPct > 75%) → trust immediately
      // Confident fail  : clientDist > 0.75 (matchPct < 25%) → trust immediately
      // Ambiguous zone  : 0.25–0.75 → R50 gives a more accurate answer
      if (clientDist >= 0.25 && clientDist <= 0.75 && idFaceCrop && liveCrop) {
        setStatusMsg("Running advanced verification…")
        try {
          const res = await fetch("/api/face-match", {
            method : "POST",
            headers: { "Content-Type": "application/json" },
            body   : JSON.stringify({ idCrop: idFaceCrop, liveCrop }),
          })
          if (res.ok) {
            const { distance } = await res.json() as { distance: number }
            finalDist = distance
          }
          // If server unavailable or errored, fall back to clientDist silently
        } catch {
          // Network error — keep clientDist
        }
      }

      const finalResult: "passed" | "failed" = finalDist < MATCH_THRESHOLD ? "passed" : "failed"
      setDistance(finalDist)
      setResult(finalResult)
      await logVerification(idType, scanMode, finalResult)
      setProcessing(false)
      setStep("result")
    },
    [faceDescriptorFromId, idFaceCrop, idType, scanMode]
  )

  async function logVerification(idType: string, scanMode: string, result: string) {
    try {
      await fetch("/api/verifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idType, scanMode, result }),
      })
    } catch {
      // Non-critical
    }
  }

  // Both modes have 2 active steps (excluding setup/result)
  const stepNumbers: Record<Step, number> = {
    setup: 0,
    "id-scan": 1,
    "pattern-verify": 2,
    "id-face-scan": 1,
    "face-scan": 2,
    result: 3,
  }
  const totalSteps = 2

  return (
    <div className="min-h-full bg-[#0f172a] flex flex-col">
      {/* Header */}
      <header className="bg-[#1e293b] border-b border-[#334155] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className="text-[#94a3b8] hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <div className="text-white font-semibold text-sm leading-tight">ID Verification</div>
            <div className="text-[#94a3b8] text-xs">{company}</div>
          </div>
        </div>

        {step !== "setup" && step !== "result" && stepNumbers[step] > 0 && (
          <div className="text-xs text-[#94a3b8]">
            Step {stepNumbers[step]} / {totalSteps}
          </div>
        )}
      </header>

      {/* Progress bar */}
      {step !== "result" && step !== "setup" && (
        <div className="h-1 bg-[#1e293b]">
          <div
            className="h-full bg-[#3b82f6] transition-all duration-500"
            style={{ width: `${(stepNumbers[step] / totalSteps) * 100}%` }}
          />
        </div>
      )}

      <main className="flex-1 flex flex-col items-center px-4 py-6">

        {/* ── Setup ── */}
        {step === "setup" && (
          <div className="w-full max-w-sm">
            <div className="mb-6 text-center">
              <h1 className="text-xl font-bold text-white">New Verification</h1>
              <p className="text-[#94a3b8] text-sm mt-1">Select the ID type and scan mode</p>
            </div>
            <ScanModeSelector
              idType={idType}
              setIdType={setIdType}
              scanMode={scanMode}
              setScanMode={setScanMode}
              onStart={() => setStep(scanMode === "two" ? "id-face-scan" : "id-scan")}
            />
          </div>
        )}

        {/* ── ID Scan ── */}
        {step === "id-scan" && (
          <div className="w-full max-w-sm">
            <div className="mb-5 text-center">
              <h2 className="text-lg font-bold text-white">Scan the {idType}</h2>
              <p className="text-[#94a3b8] text-sm mt-1">
                Position the ID clearly within the guide frame
              </p>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-lg mb-4">
                {error}
              </div>
            )}

            <CameraScanner
              mode="id"
              onCapture={handleIdCapture}
              instruction={`Hold the ${idType} flat and steady inside the frame`}
            />
          </div>
        )}

        {/* ── ID Face Scan (two-scan mode) ── */}
        {step === "id-face-scan" && (
          <div className="w-full max-w-sm">
            <div className="mb-5 text-center">
              <h2 className="text-lg font-bold text-white">Scan Face on {idType}</h2>
              <p className="text-[#94a3b8] text-sm mt-1">
                Point the camera at the photo on the ID card
              </p>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-lg mb-4">
                {error}
              </div>
            )}

            <IDFaceScanner
              onCapture={handleIdFaceCapture}
              onError={(msg) => setError(msg)}
            />
          </div>
        )}

        {/* ── Pattern Verification ── */}
        {step === "pattern-verify" && idImageSrc && (
          <div className="w-full max-w-sm">
            <div className="mb-5 text-center">
              <h2 className="text-lg font-bold text-white">Verifying Document</h2>
              <p className="text-[#94a3b8] text-sm mt-1">
                Running smart pattern analysis…
              </p>
            </div>
            <IDPatternVerifier
              imageSrc={idImageSrc}
              onComplete={handlePatternComplete}
              onRetry={() => { setIdImageSrc(null); setStep("id-scan") }}
            />
          </div>
        )}

        {/* ── Face Scan ── */}
        {step === "face-scan" && (
          <div className="w-full max-w-sm">
            <div className="mb-5 text-center">
              <h2 className="text-lg font-bold text-white">Live Face Scan</h2>
              <p className="text-[#94a3b8] text-sm mt-1">Ask the person to look at the camera</p>
            </div>

            {idImageSrc && (
              <div className="flex items-center gap-3 bg-[#1e293b] border border-[#334155] rounded-xl p-3 mb-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={idImageSrc} alt="ID face capture" className="w-14 h-9 object-cover rounded-lg border border-[#334155]" />
                <div>
                  <div className="text-white text-xs font-medium">
                    {scanMode === "two" ? "ID face captured" : "ID verified"}
                  </div>
                  <div className="text-[#94a3b8] text-xs">
                    {scanMode === "two"
                      ? "Biometric data extracted"
                      : `Pattern score: ${patternScore}%`}
                  </div>
                </div>
                <svg className="w-4 h-4 text-green-400 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}

            {processing ? (
              <div className="flex flex-col items-center gap-4 py-16">
                <div className="w-10 h-10 border-2 border-[#3b82f6] border-t-transparent rounded-full animate-spin" />
                <p className="text-[#94a3b8] text-sm">{statusMsg}</p>
              </div>
            ) : (
              <FaceScanner
                onCapture={handleFaceCapture}
                onError={(msg) => { setError(msg); setStep("face-scan") }}
              />
            )}
          </div>
        )}

        {/* ── Result ── */}
        {step === "result" && result && (
          <div className="w-full max-w-sm mt-6">
            <VerificationResult
              result={result}
              idType={idType}
              scanMode={scanMode}
              distance={distance}
              patternScore={patternScore}
              patternChecks={patternChecks}
              ocrData={ocrData}
              onReset={reset}
            />
            <Link
              href="/dashboard"
              className="block text-center text-sm text-[#94a3b8] hover:text-white mt-4 transition-colors"
            >
              Back to Dashboard
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}
