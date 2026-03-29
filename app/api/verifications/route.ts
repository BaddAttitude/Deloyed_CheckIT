import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const verifications = await prisma.verification.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  })

  return NextResponse.json(verifications)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { idType, scanMode, result } = await req.json()

    if (!idType || !scanMode || !result) {
      return NextResponse.json(
        { error: "idType, scanMode, and result are required" },
        { status: 400 }
      )
    }

    const verification = await prisma.verification.create({
      data: {
        userId: session.user.id,
        idType,
        scanMode,
        result,
      },
    })

    return NextResponse.json(verification, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
