"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import Image from "next/image"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    })

    setLoading(false)

    if (result?.error) {
      setError("Invalid email or password")
    } else {
      router.push("/dashboard")
    }
  }

  return (
    <div className="min-h-full flex flex-col items-center justify-center bg-[#0f172a] px-5 py-8 sm:py-12">
      {/* Logo */}
      <Link href="/" className="mb-7">
        <Image src="/CheckIt_logo.png" alt="CheckIt" width={130} height={44} style={{ width: 130, height: "auto" }} className="object-contain" priority />
      </Link>

      <div className="w-full max-w-sm">
        <div className="bg-[#1e293b] border border-[#334155] rounded-2xl p-6 sm:p-8">
          <h1 className="text-2xl font-bold text-white mb-1">Welcome back</h1>
          <p className="text-[#94a3b8] text-sm mb-7">Sign in to your account</p>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-lg mb-5">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#94a3b8] mb-1.5">
                Email address
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full bg-[#0f172a] border border-[#334155] focus:border-[#3b82f6] text-white placeholder-[#475569] rounded-xl px-4 py-3.5 text-base outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#94a3b8] mb-1.5">
                Password
              </label>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#0f172a] border border-[#334155] focus:border-[#3b82f6] text-white placeholder-[#475569] rounded-xl px-4 py-3.5 text-base outline-none transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-xl transition-colors text-base mt-2"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-[#94a3b8] mt-5">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-[#3b82f6] hover:underline font-medium">
            Sign up free
          </Link>
        </p>
      </div>
    </div>
  )
}
