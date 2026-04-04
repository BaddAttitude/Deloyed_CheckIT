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
    if (imageSrc) {
      onCapture(imageSrc)
    }
    setCapturing(false)
  }, [webcamRef, onCapture, capturing])

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {/* Camera frame */}
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

        {/* ── ID card overlay ── */}
        {mode === "id" ? (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {/*
              UK DL is credit-card size: 85.6 × 54 mm → aspect ratio 1.586:1
              We render the guide at 88% of the container width.
              The box-shadow vignette darkens everything outside the card.
            */}
            <div
              className="relative border-2 border-[#3b82f6] rounded-lg"
              style={{
                width:       "88%",
                aspectRatio: "85.6 / 54",
                boxShadow:   "0 0 0 9999px rgba(0,0,0,0.52)",
              }}
            >
              {/* Corner accents */}
              {[
                "top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl",
                "top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr",
                "bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl",
                "bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br",
              ].map((cls, i) => (
                <div key={i} className={`absolute w-5 h-5 border-[#3b82f6] ${cls}`} />
              ))}

              {/* Photo placeholder — left ~32% */}
              <div className="absolute left-[3%] top-[7%] w-[29%] bottom-[7%] border border-[#3b82f6]/30 rounded-sm flex flex-col items-center justify-center gap-0.5">
                <svg className="w-4 h-4 text-[#3b82f6]/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="text-[#3b82f6]/30 text-[6px] font-mono tracking-widest">PHOTO</span>
              </div>

              {/* Field labels — right ~65% */}
              <div className="absolute left-[35%] top-[7%] right-[3%] bottom-[7%] flex flex-col justify-around">
                {[
                  { num: "1.",  label: "Surname" },
                  { num: "2.",  label: "Given names" },
                  { num: "3.",  label: "Date of birth" },
                  { num: "4a.", label: "Issue date" },
                  { num: "4b.", label: "Expiry date" },
                ].map(({ num, label }) => (
                  <div key={num} className="flex items-center gap-1">
                    <span className="text-[#3b82f6] text-[7px] font-mono font-bold flex-shrink-0">{num}</span>
                    <div className="flex-1 border-b border-dashed border-[#3b82f6]/20" />
                    <span className="text-[#3b82f6]/45 text-[6px] font-mono flex-shrink-0">{label}</span>
                  </div>
                ))}
              </div>

              {/* Instruction above */}
              <div className="absolute -top-6 inset-x-0 text-center">
                <span className="text-[11px] text-white/85 font-medium">
                  Align full licence within the frame
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

        {/* Scanning animation line */}
        {ready && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="h-0.5 bg-[#3b82f6]/60 animate-scan-line" />
          </div>
        )}

        {/* Not ready overlay */}
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
