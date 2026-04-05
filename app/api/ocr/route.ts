import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages"

export async function POST(req: NextRequest) {
  let imageData: string
  try {
    const body = await req.json()
    imageData = body.imageData
    if (!imageData) throw new Error("missing imageData")
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ text: "", error: "ANTHROPIC_API_KEY not set" }, { status: 200 })
  }

  try {
    // Strip data URI prefix to get raw base64
    const base64 = imageData.replace(/^data:image\/\w+;base64,/, "")
    const mediaType = imageData.startsWith("data:image/png") ? "image/png" : "image/jpeg"

    const res = await fetch(ANTHROPIC_API, {
      method:  "POST",
      headers: {
        "x-api-key":         apiKey,
        "anthropic-version": "2023-06-01",
        "content-type":      "application/json",
      },
      body: JSON.stringify({
        model:      "claude-haiku-4-5-20251001",
        max_tokens: 256,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64 },
            },
            {
              type: "text",
              text:
`This is a UK Driving Licence. Read only the numbered text fields printed on it.
Reply in EXACTLY this format, one field per line, nothing else:
1: [text after "1."]
2: [text after "2." including any title like MR or MRS]
3: [date and nationality after "3." e.g. 13.04.2005 NIGERIA]
4a: [date after "4a."]
4b: [date after "4b."]
Write NOT_FOUND if a field is not visible.`,
            },
          ],
        }],
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      const errBody = await res.text()
      throw new Error(`Anthropic API ${res.status}: ${errBody}`)
    }

    const json = await res.json() as {
      content: Array<{ type: string; text?: string }>
    }

    const raw = json.content.find(b => b.type === "text")?.text ?? ""

    // Convert "1: GODDEY" → "1. GODDEY" so the existing id-ocr.ts parser can pick it up
    const text = raw
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean)
      .map(l => l.replace(/^(\d+[a-z]?)\s*:\s*/i, "$1. "))
      .join("\n")

    return NextResponse.json({ text })

  } catch (err) {
    console.error("[OCR] error:", err)
    return NextResponse.json({ text: "", error: String(err) }, { status: 200 })
  }
}
