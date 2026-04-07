import Link from "next/link"
import Image from "next/image"

export default function LandingPage() {
  return (
    <div className="min-h-full flex flex-col bg-[#0f172a]">
      {/* Navbar */}
      <nav className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-[#1e293b]">
        <div className="flex items-center">
          <Image src="/CheckIt_logo.png" alt="CheckIt" width={110} height={38} style={{ width: 110, height: "auto" }} className="object-contain" priority />
        </div>
        <div className="flex items-center gap-2">
          <Link href="/login" className="text-sm text-[#94a3b8] hover:text-white transition-colors px-3 py-2">
            Log In
          </Link>
          <Link href="/signup" className="text-sm bg-[#3b82f6] hover:bg-[#2563eb] text-white px-4 py-2 rounded-lg transition-colors font-medium">
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex flex-col items-center justify-center text-center px-5 py-10 sm:py-20 flex-1">
        <div className="inline-flex items-center gap-2 bg-[#1e293b] border border-[#3b82f6]/30 text-[#3b82f6] text-xs font-semibold px-3 py-1.5 rounded-full mb-5">
          <span className="w-1.5 h-1.5 bg-[#3b82f6] rounded-full animate-pulse" />
          Trusted ID Verification
        </div>

        <h1 className="text-3xl sm:text-5xl font-extrabold text-white leading-tight mb-4 max-w-3xl">
          Instant.{" "}
          <span className="text-[#3b82f6]">Accurate.</span>{" "}
          Secure.
        </h1>

        <p className="text-[#94a3b8] text-base sm:text-lg max-w-sm sm:max-w-xl mb-8 text-center">
          CheckIt empowers security teams to verify IDs in seconds with optional
          face biometric matching for maximum confidence.
        </p>

        <div className="flex flex-col gap-3 w-full max-w-xs sm:flex-row sm:max-w-none sm:justify-center">
          <Link
            href="/signup"
            className="bg-[#3b82f6] hover:bg-[#2563eb] text-white font-semibold px-8 py-4 rounded-xl transition-colors text-center"
          >
            Get Started
          </Link>
          <Link
            href="/login"
            className="border border-[#334155] hover:border-[#3b82f6] text-white font-semibold px-8 py-4 rounded-xl transition-colors text-center"
          >
            Sign In
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="px-4 sm:px-6 py-10 sm:py-16 border-t border-[#1e293b]">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-xl sm:text-2xl font-bold text-center text-white mb-6 sm:mb-10">
            ID Verification and Biometric Verification<br />with Confidence
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* One Scan Card */}
            <div className="bg-[#1e293b] border border-[#334155] rounded-2xl p-5">
              <div className="w-11 h-11 bg-[#3b82f6]/20 rounded-xl flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-[#3b82f6]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h3 className="text-white font-bold text-base mb-1.5">ID Scan</h3>
              <p className="text-[#94a3b8] text-sm leading-relaxed">
                Quick ID scan and validation. Perfect for fast-paced environments
                where speed matters.
              </p>
              <div className="mt-3 flex items-center gap-2 text-xs text-[#3b82f6] font-medium">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Scan ID — get result instantly
              </div>
            </div>

            {/* Two Scan Card */}
            <div className="bg-[#1e293b] border border-[#3b82f6]/40 rounded-2xl p-5 relative overflow-hidden">
<div className="w-11 h-11 bg-[#3b82f6]/20 rounded-xl flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-[#3b82f6]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="text-white font-bold text-base mb-1.5">Biometric Scan</h3>
              <p className="text-[#94a3b8] text-sm leading-relaxed">
                Biometric-grade verification. Scans the ID then performs a live
                face comparison.
              </p>
              <div className="mt-3 space-y-1">
                {["Scan ID + extract face", "Live blink liveness check", "Biometric face match"].map((step) => (
                  <div key={step} className="flex items-center gap-2 text-xs text-[#3b82f6] font-medium">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {step}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats banner */}
      <section className="bg-[#1e293b] border-t border-[#334155] px-4 sm:px-6 py-8">
        <div className="max-w-4xl mx-auto grid grid-cols-3 gap-3 text-center">
          {[
            { value: "< 20s", label: "Avg. verify time" },
            { value: "99.2%", label: "Accuracy" },
            { value: "100%", label: "Confidence" },
          ].map((stat) => (
            <div key={stat.label}>
              <div className="text-xl sm:text-2xl font-extrabold text-[#3b82f6]">{stat.value}</div>
              <div className="text-xs text-[#94a3b8] mt-1 leading-tight">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="px-4 py-5 border-t border-[#1e293b] text-center text-xs text-[#475569]">
        © {new Date().getFullYear()} CheckIt. Built for security professionals.
      </footer>
    </div>
  )
}
