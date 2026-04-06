"use client"

import { useState } from "react"
import Image from "next/image"

interface Props {
  onClose: () => void
}

type LicenceType = "full" | "provisional"
type Side        = "front" | "back"

const IMAGES: Record<LicenceType, Record<Side, string>> = {
  full:        { front: "/uv-full-front.jpg",        back: "/uv-full-back.jpg"        },
  provisional: { front: "/uv-provisional-front.jpg", back: "/uv-provisional-back.jpg" },
}

const TYPE_LABELS: Record<LicenceType, string> = {
  full:        "Full Licence",
  provisional: "Provisional",
}

export default function UVReferenceCheck({ onClose }: Props) {
  const [licenceType, setLicenceType] = useState<LicenceType>("full")
  const [side, setSide]               = useState<Side>("front")

  return (
    <div className="w-full max-w-sm flex flex-col gap-4">

      {/* Title */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 mb-1">
          <div className="w-8 h-8 bg-[#7c3aed]/20 rounded-xl flex items-center justify-center">
            <svg className="w-4 h-4 text-[#a78bfa]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.347.347a3.5 3.5 0 01-4.95 0l-.347-.347z" />
            </svg>
          </div>
          <h2 className="text-white font-bold text-lg">UV Reference Guide</h2>
        </div>
        <p className="text-[#94a3b8] text-sm">
          Compare the ID against these genuine UV security patterns
        </p>
      </div>

      {/* Full / Provisional selector */}
      <div className="flex bg-[#1e293b] border border-[#334155] rounded-xl p-1">
        {(["full", "provisional"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setLicenceType(t)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
              licenceType === t
                ? "bg-[#7c3aed] text-white shadow"
                : "text-[#94a3b8] hover:text-white"
            }`}
          >
            {TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Front / Back toggle */}
      <div className="flex bg-[#0f172a] border border-[#334155] rounded-xl p-1">
        {(["front", "back"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors capitalize ${
              side === s
                ? "bg-[#1e293b] text-white border border-[#7c3aed]/50 shadow"
                : "text-[#475569] hover:text-[#94a3b8]"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* UV image */}
      <div className="relative w-full aspect-[16/10] bg-[#0f0a1e] border border-[#7c3aed]/30 rounded-2xl overflow-hidden">
        <Image
          key={`${licenceType}-${side}`}
          src={IMAGES[licenceType][side]}
          alt={`${TYPE_LABELS[licenceType]} UV ${side}`}
          fill
          className="object-contain"
          unoptimized
        />
        {/* Corner labels */}
        <div className="absolute top-2 left-2 flex gap-1.5">
          <span className="bg-[#7c3aed]/80 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
            {TYPE_LABELS[licenceType]}
          </span>
          <span className="bg-[#1e293b]/90 text-[#a78bfa] text-[10px] font-bold px-2 py-0.5 rounded-full capitalize">
            {side}
          </span>
        </div>
      </div>

      {/* Guidance */}
      <div className="bg-[#1e293b] border border-[#334155] rounded-xl px-4 py-3 space-y-1.5">
        <p className="text-[#94a3b8] text-xs leading-relaxed">
          <span className="text-green-400 font-semibold">Genuine: </span>
          glowing blue/green fibres, fluorescent lines and stamps visible.
        </p>
        <p className="text-[#94a3b8] text-xs leading-relaxed">
          <span className="text-red-400 font-semibold">Fake: </span>
          little or no glow, missing security patterns.
        </p>
      </div>

      {/* Done */}
      <button
        onClick={onClose}
        className="w-full bg-[#1e293b] border border-[#334155] hover:border-[#3b82f6]/60 text-white font-semibold py-3 rounded-xl transition-colors"
      >
        Done
      </button>

    </div>
  )
}
