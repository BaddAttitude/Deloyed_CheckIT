import type { Metadata, Viewport } from "next"
import "./globals.css"
import SessionProvider from "@/components/SessionProvider"

export const metadata: Metadata = {
  title: "CheckIt — ID Verification",
  description: "Fast, secure ID verification for security professionals",
  manifest: "/manifest.json",
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#1e40af",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-[#0f172a] text-white">
          <SessionProvider>{children}</SessionProvider>
        </body>
    </html>
  )
}
