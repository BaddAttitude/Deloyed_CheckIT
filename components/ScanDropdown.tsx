"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"

export default function ScanDropdown() {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  function go(mode: "one" | "two") {
    setOpen(false)
    router.push(`/verify?mode=${mode}`)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 bg-[#3b82f6] hover:bg-[#2563eb] text-white font-semibold px-3 py-2 rounded-lg transition-colors"
        aria-label="New verification"
      >
        {/* Camera icon — always visible */}
        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        {/* Text — hidden on very small screens */}
        <span className="text-sm hidden xs:inline sm:inline">New Scan</span>
        <svg
          className={`w-3.5 h-3.5 transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-52 bg-[#1e293b] border border-[#334155] rounded-xl shadow-xl z-50 overflow-hidden">
          <button
            onClick={() => go("one")}
            className="w-full flex items-start gap-3 px-4 py-3.5 hover:bg-[#334155] transition-colors text-left"
          >
            <div className="w-8 h-8 bg-[#3b82f6]/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-[#3b82f6]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <div className="text-white text-sm font-semibold">ID Scan</div>
              <div className="text-[#94a3b8] text-xs">ID document only</div>
            </div>
          </button>

          <div className="border-t border-[#334155]" />

          <button
            onClick={() => go("two")}
            className="w-full flex items-start gap-3 px-4 py-3.5 hover:bg-[#334155] transition-colors text-left"
          >
            <div className="w-8 h-8 bg-[#3b82f6]/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-[#3b82f6]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <div className="text-white text-sm font-semibold">Biometric Scan</div>
              <div className="text-[#94a3b8] text-xs">ID + live face match</div>
            </div>
          </button>
        </div>
      )}
    </div>
  )
}
