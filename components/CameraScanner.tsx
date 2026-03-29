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
      : { facingMode: { ideal: "environment" }, width: 1280, height: 720 }

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
          screenshotQuality={0.92}
          videoConstraints={videoConstraints}
          onUserMedia={() => setReady(true)}
          onUserMediaError={() => setReady(false)}
          className="w-full aspect-[4/3] object-cover"
          mirrored={mode === "face"}
        />

        {/* Overlay guide frame */}
        {mode === "id" ? (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-4/5 h-1/2 border-2 border-white/70 rounded-xl relative">
              {/* Corner accents */}
              {[
                "top-0 left-0 border-t-2 border-l-2 rounded-tl-lg",
                "top-0 right-0 border-t-2 border-r-2 rounded-tr-lg",
                "bottom-0 left-0 border-b-2 border-l-2 rounded-bl-lg",
                "bottom-0 right-0 border-b-2 border-r-2 rounded-br-lg",
              ].map((cls, i) => (
                <div
                  key={i}
                  className={`absolute w-4 h-4 border-[#3b82f6] ${cls}`}
                />
              ))}
              <div className="absolute inset-x-0 -top-6 text-center text-xs text-white/80">
                Align ID within frame
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
