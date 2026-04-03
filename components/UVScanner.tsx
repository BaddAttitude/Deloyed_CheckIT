"use client"

import { useState } from "react"
import CameraScanner from "@/components/CameraScanner"

interface Props {
  onCapture: (imageSrc: string) => void
  onSkip: () => void
}

export default function UVScanner({ onCapture, onSkip }: Props) {
  const [showCamera, setShowCamera] = useState(false)

  if (showCamera) {
    return (
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 bg-[#7c3aed]/10 border border-[#7c3aed]/30 rounded-xl px-3 py-2.5 mb-4">
          <div className="w-2 h-2 bg-[#7c3aed] rounded-full animate-pulse flex-shrink-0" />
          <p className="text-[#a78bfa] text-xs font-medium">
            Shine UV torch on ID — capture when security patterns glow
          </p>
        </div>
        <CameraScanner
          mode="id"
          onCapture={onCapture}
          instruction="Keep UV light the only source. Tap when you can see glowing patterns."
        />
        <button
          onClick={onSkip}
          className="w-full mt-4 text-[#475569] text-sm py-2 hover:text-[#94a3b8] transition-colors"
        >
          Skip UV check
        </button>
      </div>
    )
  }

  return (
    <div className="w-full max-w-sm">
      {/* Header card */}
      <div className="bg-[#1e293b] border border-[#7c3aed]/40 rounded-2xl p-5 mb-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-[#7c3aed]/20 rounded-xl flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-[#a78bfa]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.347.347a3.5 3.5 0 01-4.95 0l-.347-.347z" />
            </svg>
          </div>
          <div>
            <div className="text-white font-semibold text-sm">UV Security Check</div>
            <div className="text-[#94a3b8] text-xs">Detects genuine fluorescent features</div>
          </div>
        </div>

        <div className="space-y-3">
          {[
            { n: "1", icon: "🔦", text: "Get a UV torch (365 nm)" },
            { n: "2", icon: "🌑", text: "Dim the room or shield from daylight" },
            { n: "3", icon: "💜", text: "Shine UV light directly onto the ID" },
            { n: "4", icon: "📷", text: "Tap capture when patterns glow" },
          ].map(({ n, icon, text }) => (
            <div key={n} className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-[#7c3aed]/20 text-[#a78bfa] text-xs font-bold flex items-center justify-center flex-shrink-0">
                {n}
              </div>
              <span className="text-[#94a3b8] text-sm">{icon} {text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* What to expect */}
      <div className="bg-[#0f172a] border border-[#334155] rounded-xl px-3 py-2.5 mb-5">
        <p className="text-xs text-[#475569] leading-relaxed">
          <span className="text-[#94a3b8] font-medium">Genuine IDs: </span>
          glowing blue/green fibres, fluorescent stamps or pattern lines.
          <span className="text-[#94a3b8] font-medium"> Fakes: </span>
          little or no glow.
        </p>
      </div>

      <button
        onClick={() => setShowCamera(true)}
        className="w-full bg-[#7c3aed] hover:bg-[#6d28d9] text-white font-semibold py-3.5 rounded-xl transition-colors mb-3"
      >
        Ready — Open Camera
      </button>
      <button
        onClick={onSkip}
        className="w-full text-[#475569] text-sm py-2 hover:text-[#94a3b8] transition-colors"
      >
        No UV light available — skip this check
      </button>
    </div>
  )
}
