"use client"

const ID_TYPES = [
  { id: "Passport", label: "Passport", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
  { id: "Driver's License", label: "Driver's License", icon: "M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c0 1.306.835 2.417 2 2.83M17 16a2 2 0 00-2-2.83" },
]

interface ScanModeProps {
  idType: string
  setIdType: (v: string) => void
  scanMode: "one" | "two"
  setScanMode: (v: "one" | "two") => void
  onStart: () => void
}

export default function ScanModeSelector({
  idType,
  setIdType,
  scanMode,
  setScanMode,
  onStart,
}: ScanModeProps) {
  return (
    <div className="flex flex-col gap-5 w-full max-w-sm mx-auto">

      {/* ID Type — tap buttons */}
      <div>
        <label className="block text-sm font-medium text-[#94a3b8] mb-2">
          ID Type
        </label>
        <div className="grid grid-cols-2 gap-3">
          {ID_TYPES.map((t) => (
            <button
              key={t.id}
              onClick={() => setIdType(t.id)}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${
                idType === t.id
                  ? "border-[#3b82f6] bg-[#3b82f6]/10"
                  : "border-[#334155] bg-[#1e293b]"
              }`}
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                idType === t.id ? "bg-[#3b82f6]/20" : "bg-[#0f172a]"
              }`}>
                <svg className="w-5 h-5 text-[#3b82f6]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={t.icon} />
                </svg>
              </div>
              <span className={`text-sm font-semibold text-center leading-tight ${
                idType === t.id ? "text-white" : "text-[#94a3b8]"
              }`}>
                {t.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Scan Mode */}
      <div>
        <label className="block text-sm font-medium text-[#94a3b8] mb-2">
          Verification Mode
        </label>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setScanMode("one")}
            className={`p-4 rounded-xl border text-left transition-all ${
              scanMode === "one"
                ? "border-[#3b82f6] bg-[#3b82f6]/10"
                : "border-[#334155] bg-[#1e293b]"
            }`}
          >
            <div className="flex items-center justify-center w-9 h-9 bg-[#0f172a] rounded-lg mb-2.5">
              <svg className="w-5 h-5 text-[#3b82f6]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              </svg>
            </div>
            <div className="text-white text-sm font-semibold">One Scan</div>
            <div className="text-[#94a3b8] text-xs mt-0.5">ID only</div>
          </button>

          <button
            onClick={() => setScanMode("two")}
            className={`p-4 rounded-xl border text-left transition-all relative ${
              scanMode === "two"
                ? "border-[#3b82f6] bg-[#3b82f6]/10"
                : "border-[#334155] bg-[#1e293b]"
            }`}
          >
            {scanMode === "two" && (
              <div className="absolute -top-2 -right-2 w-5 h-5 bg-[#3b82f6] rounded-full flex items-center justify-center">
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
            <div className="flex items-center justify-center w-9 h-9 bg-[#0f172a] rounded-lg mb-2.5">
              <svg className="w-5 h-5 text-[#3b82f6]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div className="text-white text-sm font-semibold">Two Scan</div>
            <div className="text-[#94a3b8] text-xs mt-0.5">ID + Face</div>
          </button>
        </div>
      </div>

      {/* Description */}
      <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-4 text-sm text-[#94a3b8] leading-relaxed">
        {scanMode === "one"
          ? "Scans and validates the ID document. Quick and efficient for standard checks."
          : "Scans the ID then captures a live selfie. Biometrically compares the ID photo to the person in front of you."}
      </div>

      <button
        onClick={onStart}
        className="w-full bg-[#3b82f6] hover:bg-[#2563eb] text-white font-semibold py-4 rounded-xl transition-colors text-base"
      >
        Begin Scan
      </button>
    </div>
  )
}
