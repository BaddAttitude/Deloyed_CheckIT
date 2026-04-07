"use client"

import { useState, useCallback } from "react"
import Link from "next/link"
import CameraScanner from "@/components/CameraScanner"
import IDFaceScanner from "@/components/IDFaceScanner"
import FaceScanner from "@/components/FaceScanner"
import UKDLVerifier from "@/components/UKDLVerifier"
import VerificationResult from "@/components/VerificationResult"
import UVReferenceCheck from "@/components/UVReferenceCheck"
import {
  compareFaceDescriptors,
  MATCH_THRESHOLD,
} from "@/lib/face-api-loader"
import type { PatternCheckResult } from "@/lib/check-types"
import type { ExtractedIDData } from "@/lib/id-ocr"

type Step = "setup" | "id-scan" | "dl-verify" | "id-face-scan" | "face-scan" | "result" | "uv-check"

interface Props {
  company: string
  initialMode: "one" | "two"
}

export default function VerifyClient({ company, initialMode }: Props) {
  const [step, setStep]   = useState<Step>("setup")
  const [idType, setIdType] = useState("UK Driving Licence")
  const [scanMode, setScanMode] = useState<"one" | "two">(initialMode)
  const [idImageSrc, setIdImageSrc]               = useState<string | null>(null)
  const [faceDescriptorFromId, setFaceDescriptorFromId] = useState<Float32Array | null>(null)
  const [idFaceCrop, setIdFaceCrop]               = useState<string | null>(null)
  const [result, setResult]                       = useState<"passed" | "failed" | null>(null)
  const [distance, setDistance]                   = useState<number | undefined>(undefined)
  const [dlScore, setDlScore]                     = useState<number | undefined>(undefined)
  const [dlChecks, setDlChecks]                   = useState<PatternCheckResult[]>([])
  const [ocrData, setOcrData]                     = useState<ExtractedIDData | null>(null)
  const [statusMsg, setStatusMsg]                 = useState("")
  const [processing, setProcessing]               = useState(false)
  const [error, setError]                         = useState("")

  const reset = useCallback(() => {
    setStep("setup")
    setIdImageSrc(null)
    setFaceDescriptorFromId(null)
    setIdFaceCrop(null)
    setResult(null)
    setDistance(undefined)
    setDlScore(undefined)
    setDlChecks([])
    setOcrData(null)
    setStatusMsg("")
    setError("")
    setProcessing(false)
  }, [])

  // ── One-scan: ID captured → UK DL verifier ─────────────────────────────────
  const handleIdCapture = useCallback((imageSrc: string) => {
    setIdImageSrc(imageSrc)
    setError("")
    setStep("dl-verify")
  }, [])

  // ── One-scan: UK DL verifier done ──────────────────────────────────────────
  const handleDLComplete = useCallback(
    async (passed: boolean, score: number, checks: PatternCheckResult[], ocr: ExtractedIDData | null) => {
      setDlScore(score)
      setDlChecks(checks)
      setOcrData(ocr)
      const finalResult: "passed" | "failed" = passed ? "passed" : "failed"
      setResult(finalResult)
      await logVerification(idType, "one", finalResult)
      setStep("result")
    },
    [idType]
  )

  // ── Two-scan step 1: face on ID captured ───────────────────────────────────
  const handleIdFaceCapture = useCallback((imageSrc: string, descriptor: Float32Array, cropPixels: string) => {
    setIdImageSrc(imageSrc)
    setFaceDescriptorFromId(descriptor)
    setIdFaceCrop(cropPixels)
    setStep("face-scan")
  }, [])

  // ── Two-scan step 2: live face captured → hybrid biometric comparison ──────
  const handleFaceCapture = useCallback(
    async (_imageSrc: string, liveDescriptor: Float32Array, liveCrop: string) => {
      if (!faceDescriptorFromId) return
      setProcessing(true)
      setStatusMsg("Comparing faces…")

      const clientDist = compareFaceDescriptors(faceDescriptorFromId, liveDescriptor)
      let finalDist    = clientDist

      // Escalate ambiguous zone to server-side ArcFace R50
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
        } catch {
          // Network error — keep clientDist
        }
      }

      const finalResult: "passed" | "failed" = finalDist < MATCH_THRESHOLD ? "passed" : "failed"
      setDistance(finalDist)
      setResult(finalResult)
      await logVerification(idType, "two", finalResult)
      setProcessing(false)
      setStep("result")
    },
    [faceDescriptorFromId, idFaceCrop, idType]
  )

  async function logVerification(idType: string, scanMode: string, result: string) {
    try {
      await fetch("/api/verifications", {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ idType, scanMode, result }),
      })
    } catch {
      // Non-critical
    }
  }

  const stepNumbers: Record<Step, number> = {
    setup: 0,
    "id-scan": 1,
    "dl-verify": 2,
    "id-face-scan": 1,
    "face-scan": 2,
    result: 3,
    "uv-check": 0,
  }
  const totalSteps = 2

  return (
    <div className="min-h-full bg-[#0f172a] flex flex-col overflow-x-hidden">
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
              <p className="text-[#94a3b8] text-sm mt-1">Select a scan mode to begin</p>
            </div>

            <div className="flex flex-col gap-3">
              {/* One-scan (UK DL Algorithm) */}
              <button
                onClick={() => { setScanMode("one"); setStep("id-scan") }}
                className="w-full flex items-start gap-4 bg-[#1e293b] border border-[#334155] hover:border-[#3b82f6]/60 rounded-2xl p-4 transition-colors text-left"
              >
                <div className="w-10 h-10 bg-[#3b82f6]/20 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg className="w-5 h-5 text-[#3b82f6]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div>
                  <div className="text-white font-semibold text-sm">ID Scan</div>
                  <div className="text-[#94a3b8] text-xs mt-0.5">Scan UK Driving Licence — algorithm verification</div>
                </div>
              </button>

              {/* UV Check tab — under Single Scan */}
              <button
                onClick={() => setStep("uv-check")}
                className="w-full flex items-start gap-4 bg-[#0f0a1e] border border-[#7c3aed]/40 hover:border-[#7c3aed]/80 rounded-2xl p-4 transition-colors text-left"
              >
                <div className="w-10 h-10 bg-[#7c3aed]/20 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg className="w-5 h-5 text-[#a78bfa]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.347.347a3.5 3.5 0 01-4.95 0l-.347-.347z" />
                  </svg>
                </div>
                <div>
                  <div className="text-[#a78bfa] font-semibold text-sm">UV Check</div>
                  <div className="text-[#94a3b8] text-xs mt-0.5">View genuine UV security patterns — front &amp; back</div>
                </div>
              </button>

              {/* Two-scan (Biometric) */}
              <button
                onClick={() => { setScanMode("two"); setStep("id-face-scan") }}
                className="w-full flex items-start gap-4 bg-[#1e293b] border border-[#334155] hover:border-[#3b82f6]/60 rounded-2xl p-4 transition-colors text-left"
              >
                <div className="w-10 h-10 bg-[#3b82f6]/20 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg className="w-5 h-5 text-[#3b82f6]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div>
                  <div className="text-white font-semibold text-sm">Biometric Scan</div>
                  <div className="text-[#94a3b8] text-xs mt-0.5">ID photo + live face — biometric match</div>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* ── One-scan: ID Scan ── */}
        {step === "id-scan" && (
          <div className="w-full max-w-sm">
            <div className="mb-5 text-center">
              <h2 className="text-lg font-bold text-white">Scan UK Driving Licence</h2>
              <p className="text-[#94a3b8] text-sm mt-1">
                Position the licence flat — ensure all text is clearly visible
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
              instruction="Fill the strip with the text fields (right side of the card) — exclude the photo"
            />
          </div>
        )}

        {/* ── One-scan: UK DL Algorithm Verification ── */}
        {step === "dl-verify" && idImageSrc && (
          <div className="w-full max-w-sm">
            <div className="mb-5 text-center">
              <h2 className="text-lg font-bold text-white">Verifying Licence</h2>
              <p className="text-[#94a3b8] text-sm mt-1">
                Extracting fields and running algorithm…
              </p>
            </div>
            <UKDLVerifier
              imageSrc={idImageSrc}
              onComplete={handleDLComplete}
              onRetry={() => { setIdImageSrc(null); setStep("id-scan") }}
            />
          </div>
        )}

        {/* ── Two-scan: ID Face Scan ── */}
        {step === "id-face-scan" && (
          <div className="w-full max-w-sm">
            <div className="mb-5 text-center">
              <h2 className="text-lg font-bold text-white">Scan Face on ID</h2>
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

        {/* ── Two-scan: Live Face Scan ── */}
        {step === "face-scan" && (
          <div className="w-full max-w-sm">
            <div className="mb-5 text-center">
              <h2 className="text-lg font-bold text-white">Live Face Scan</h2>
              <p className="text-[#94a3b8] text-sm mt-1">Ask the person to look at the camera</p>
            </div>

            {idImageSrc && (
              <div className="flex items-center gap-3 bg-[#1e293b] border border-[#334155] rounded-xl p-3 mb-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={idImageSrc} alt="ID capture" className="w-14 h-9 object-cover rounded-lg border border-[#334155]" />
                <div>
                  <div className="text-white text-xs font-medium">ID face captured</div>
                  <div className="text-[#94a3b8] text-xs">Biometric data extracted</div>
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

        {/* ── UV Reference Check ── */}
        {step === "uv-check" && (
          <UVReferenceCheck onClose={() => setStep("setup")} />
        )}

        {/* ── Result ── */}
        {step === "result" && result && (
          <div className="w-full max-w-sm mt-6 pb-8">
            <VerificationResult
              result={result}
              idType={idType}
              scanMode={scanMode}
              distance={distance}
              patternScore={dlScore}
              patternChecks={dlChecks}
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
