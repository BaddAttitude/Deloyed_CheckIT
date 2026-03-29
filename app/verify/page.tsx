import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import VerifyClient from "./VerifyClient"

interface Props {
  searchParams: Promise<{ mode?: string }>
}

export default async function VerifyPage({ searchParams }: Props) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const company = (session.user as { company?: string }).company ?? session.user.name ?? "Your Company"
  const { mode } = await searchParams
  const initialMode: "one" | "two" = mode === "one" ? "one" : "two"

  return <VerifyClient company={company} initialMode={initialMode} />
}
