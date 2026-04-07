import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { signOut } from "@/lib/auth"

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const verifications = await prisma.verification.findMany({
    where: { userId: session.user.id, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 20,
  })

  const total = verifications.length
  const passed = verifications.filter((v) => v.result === "passed").length
  const failed = verifications.filter((v) => v.result === "failed").length

  const company = (session.user as { company?: string }).company ?? session.user.name ?? "Your Company"

  return (
    <div className="min-h-full bg-[#0f172a]">
      {/* Header */}
      <header className="bg-[#1e293b] border-b border-[#334155] px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          {/* Left: logo + company */}
          <div className="flex items-center gap-2.5 min-w-0">
            <Image src="/CheckIt_logo.png" alt="CheckIt" width={88} height={30} style={{ width: 88, height: "auto" }} className="object-contain flex-shrink-0" />
            <div className="text-[#94a3b8] text-xs border-l border-[#334155] pl-2.5 truncate flex-1 min-w-0">
              {company}
            </div>
          </div>

          {/* Right: scan + sign out */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link
              href="/verify"
              className="flex items-center gap-1.5 bg-[#3b82f6] hover:bg-[#2563eb] text-white font-semibold px-3 py-2 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-sm">New Scan</span>
            </Link>
            <form
              action={async () => {
                "use server"
                await signOut({ redirectTo: "/" })
              }}
            >
              {/* Icon-only on mobile, text on sm+ */}
              <button
                type="submit"
                className="text-[#94a3b8] hover:text-white transition-colors p-2 rounded-lg hover:bg-[#334155]"
                aria-label="Sign out"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="px-4 py-6 max-w-2xl mx-auto">
        {/* Welcome */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-white">Dashboard</h1>
          <p className="text-[#94a3b8] text-sm mt-0.5 truncate">
            {company}
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: "Total", value: total, color: "text-white" },
            { label: "Passed", value: passed, color: "text-green-400" },
            { label: "Failed", value: failed, color: "text-red-400" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-[#1e293b] border border-[#334155] rounded-xl p-3 sm:p-5 text-center"
            >
              <div className={`text-2xl sm:text-3xl font-extrabold ${stat.color}`}>
                {stat.value}
              </div>
              <div className="text-[#94a3b8] text-xs mt-1">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* CTA if no verifications */}
        {total === 0 && (
          <div className="bg-[#1e293b] border border-[#3b82f6]/30 rounded-2xl p-8 text-center mb-6">
            <div className="w-14 h-14 bg-[#3b82f6]/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-[#3b82f6]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              </svg>
            </div>
            <h2 className="text-white font-bold text-lg mb-2">No verifications yet</h2>
            <p className="text-[#94a3b8] text-sm mb-6">
              Start scanning IDs to build your verification history.
            </p>
            <Link
              href="/verify"
              className="inline-block bg-[#3b82f6] hover:bg-[#2563eb] text-white font-semibold px-6 py-3.5 rounded-xl transition-colors"
            >
              Scan ID Now
            </Link>
          </div>
        )}

        {/* Recent verifications */}
        {total > 0 && (
          <div className="bg-[#1e293b] border border-[#334155] rounded-2xl overflow-hidden">
            <div className="px-4 py-3.5 border-b border-[#334155] flex items-center justify-between">
              <h2 className="text-white font-semibold text-sm">Recent Verifications for Shift</h2>
              <Link
                href="/verify"
                className="text-[#3b82f6] hover:text-[#60a5fa] text-sm font-medium transition-colors"
              >
                + New Scan
              </Link>
            </div>

            <div className="divide-y divide-[#334155]">
              {verifications.map((v) => (
                <div
                  key={v.id}
                  className="px-4 py-3.5 flex items-center gap-3"
                >
                  {/* Status dot */}
                  <div
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      v.result === "passed" ? "bg-green-400" : "bg-red-400"
                    }`}
                  />

                  {/* ID info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-sm font-medium capitalize truncate">
                      {v.idType}
                    </div>
                    <div className="text-[#94a3b8] text-xs capitalize truncate">
                      {v.scanMode === "one" ? "ID Scan" : "Biometric Scan"} ·{" "}
                      {new Date(v.createdAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>

                  {/* Badge */}
                  <span
                    className={`text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${
                      v.result === "passed"
                        ? "bg-green-400/10 text-green-400"
                        : "bg-red-400/10 text-red-400"
                    }`}
                  >
                    {v.result.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
