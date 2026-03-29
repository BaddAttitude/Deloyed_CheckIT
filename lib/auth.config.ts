import type { NextAuthConfig } from "next-auth"

// Lightweight auth config — no Prisma, safe for Edge Runtime (proxy.ts)
export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const { pathname } = nextUrl

      const protectedRoutes = ["/dashboard", "/verify"]
      const isProtected = protectedRoutes.some((r) => pathname.startsWith(r))

      if (isProtected && !isLoggedIn) return false
      if (isLoggedIn && (pathname === "/login" || pathname === "/signup")) {
        return Response.redirect(new URL("/dashboard", nextUrl))
      }

      return true
    },
  },
  providers: [], // populated in auth.ts — not needed here
}
