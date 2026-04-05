import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages"

const PROMPT = `Act as a strict OCR field extractor.

Only extract predefined fields from an ID card.
Do not perform general OCR.

Return output exactly in this structure:

1. <SURNAME IN CAPS>
2. <FULL NAME IN CAPS>
3. <DD.MM.YYYY COUNTRY>
4a. <DD.MM.YYYY>
4b. <DD.MM.YYYY>
4c. <AUTHORITY>

Constraints:
- No extra text
- No explanations
- No JSON
- No formatting changes
- Preserve capitalization as seen
- If unsure, return best guess based on visible text`

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
    return NextResponse.json({ text: "", error: "ANTHROPIC_API_KEY not configured" }, { status: 200 })
  }

  try {
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
        max_tokens: 128,
        messages: [{
          role: "user",
          content: [
            {
              type:   "image",
              source: { type: "base64", media_type: mediaType, data: base64 },
            },
            {
              type: "text",
              text: PROMPT,
            },
          ],
        }],
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Anthropic ${res.status}: ${body.slice(0, 200)}`)
    }

    const json = await res.json() as { content: Array<{ type: string; text?: string }> }
    const text = json.content.find(b => b.type === "text")?.text ?? ""

    return NextResponse.json({ text })

  } catch (err) {
    console.error("[OCR] error:", err)
    return NextResponse.json({ text: "", error: String(err) }, { status: 200 })
  }
}
