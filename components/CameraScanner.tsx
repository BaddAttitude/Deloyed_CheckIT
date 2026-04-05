"use client"

import { useRef, useCallback, useState } from "react"
import Webcam from "react-webcam"

interface CameraScannerProps {
  mode: "id" | "face"
  onCapture: (imageSrc: string) => void
  instruction?: string
}

export default function CameraScanner({ mode, onCapture, instruction }: CameraScannerProps) {
  const webcamRef = useRef<Webcam>(null)
  const [ready, setReady] = useState(false)
  const [capturing, setCapturing] = useState(false)

  const videoConstraints =
    mode === "face"
      ? { facingMode: "user", width: 640, height: 480 }
      : { facingMode: { ideal: "environment" }, width: 1920, height: 1080 }

  const capture = useCallback(() => {
    if (!webcamRef.current || capturing) return
    setCapturing(true)
    const imageSrc = webcamRef.current.getScreenshot()
    if (imageSrc) onCapture(imageSrc)
    setCapturing(false)
  }, [webcamRef, onCapture, capturing])

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {/* Camera viewport */}
      <div className="relative w-full max-w-sm rounded-2xl overflow-hidden border-2 border-[#3b82f6]/60 bg-black shadow-lg shadow-[#3b82f6]/10">
        <Webcam
          ref={webcamRef}
          audio={false}
          screenshotFormat="image/jpeg"
          screenshotQuality={0.95}
          videoConstraints={videoConstraints}
          onUserMedia={() => setReady(true)}
          onUserMediaError={() => setReady(false)}
          className="w-full aspect-[4/3] object-cover"
          mirrored={mode === "face"}
        />

        {/* ── ID text-fields guide overlay ── */}
        {mode === "id" ? (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {/*
              The reference image shows ONLY the text section of the UK DL —
              wide landscape strip, 5 field rows, no photo area.
              We match that shape: ~95% width, ~45% height.
            */}
            <div
              className="relative rounded-sm border-2 border-[#3b82f6]"
              style={{
                width:     "95%",
                height:    "58%",
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
              }}
            >
              {/* Corner accents */}
              {[
                "top-0 left-0 border-t-[3px] border-l-[3px]",
                "top-0 right-0 border-t-[3px] border-r-[3px]",
                "bottom-0 left-0 border-b-[3px] border-l-[3px]",
                "bottom-0 right-0 border-b-[3px] border-r-[3px]",
              ].map((cls, i) => (
                <div key={i} className={`absolute w-4 h-4 border-[#3b82f6] ${cls}`} />
              ))}

              {/* 5 field rows — matching layout from the reference image */}
              <div className="absolute inset-x-3 inset-y-2 flex flex-col justify-around">

                {/* Row 1 — Surname */}
                <div className="flex items-center gap-2">
                  <span className="text-[#3b82f6] text-[9px] font-mono font-bold w-5 flex-shrink-0">1.</span>
                  <div className="flex-1 border-b border-dashed border-[#3b82f6]/35" />
                  <span className="text-[#3b82f6]/40 text-[7px] font-mono flex-shrink-0">SURNAME</span>
                </div>

                {/* Row 2 — Given names */}
                <div className="flex items-center gap-2">
                  <span className="text-[#3b82f6] text-[9px] font-mono font-bold w-5 flex-shrink-0">2.</span>
                  <div className="flex-1 border-b border-dashed border-[#3b82f6]/35" />
                  <span className="text-[#3b82f6]/40 text-[7px] font-mono flex-shrink-0">GIVEN NAMES</span>
                </div>

                {/* Row 3 — DOB + nationality */}
                <div className="flex items-center gap-2">
                  <span className="text-[#3b82f6] text-[9px] font-mono font-bold w-5 flex-shrink-0">3.</span>
                  <div className="flex-1 border-b border-dashed border-[#3b82f6]/35" />
                  <span className="text-[#3b82f6]/40 text-[7px] font-mono flex-shrink-0">DD.MM.YYYY</span>
                </div>

                {/* Row 4a — Issue date */}
                <div className="flex items-center gap-2">
                  <span className="text-[#3b82f6] text-[9px] font-mono font-bold w-5 flex-shrink-0">4a.</span>
                  <div className="flex-1 border-b border-dashed border-[#3b82f6]/35" />
                  <span className="text-[#3b82f6]/40 text-[7px] font-mono flex-shrink-0">ISSUE DATE</span>
                </div>

                {/* Row 4b — Expiry date */}
                <div className="flex items-center gap-2">
                  <span className="text-[#3b82f6] text-[9px] font-mono font-bold w-5 flex-shrink-0">4b.</span>
                  <div className="flex-1 border-b border-dashed border-[#3b82f6]/35" />
                  <span className="text-[#3b82f6]/40 text-[7px] font-mono flex-shrink-0">EXPIRY DATE</span>
                </div>

              </div>

              {/* Instruction above */}
              <div className="absolute -top-6 inset-x-0 text-center">
                <span className="text-[11px] text-white/85 font-medium">
                  Fill the frame with the text fields only
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-48 h-56 border-2 border-white/50 rounded-full">
              <div className="absolute inset-x-0 -bottom-7 text-center text-xs text-white/80">
                Position face in oval
              </div>
            </div>
          </div>
        )}

        {/* Scanning animation */}
        {ready && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="h-0.5 bg-[#3b82f6]/60 animate-scan-line" />
          </div>
        )}

        {/* Camera loading overlay */}
        {!ready && (
          <div className="absolute inset-0 bg-[#0f172a]/80 flex items-center justify-center">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-[#3b82f6] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-sm text-[#94a3b8]">Starting camera...</p>
            </div>
          </div>
        )}
      </div>

      {instruction && (
        <p className="text-[#94a3b8] text-sm text-center max-w-xs">{instruction}</p>
      )}

      {/* Capture button */}
      <button
        onClick={capture}
        disabled={!ready || capturing}
        className="w-16 h-16 rounded-full bg-white border-4 border-[#3b82f6] flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 active:scale-95 transition-transform shadow-lg"
      >
        <div className="w-10 h-10 rounded-full bg-[#3b82f6]" />
      </button>
      <p className="text-xs text-[#475569]">Tap to capture</p>
    </div>
  )
}
