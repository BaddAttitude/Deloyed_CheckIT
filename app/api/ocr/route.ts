import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

const OCR_SPACE_URL = "https://api.ocr.space/parse/image"

export async function POST(req: NextRequest) {
  let imageData: string
  try {
    const body = await req.json()
    imageData = body.imageData
    if (!imageData) throw new Error("missing imageData")
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const apiKey = process.env.OCR_SPACE_API_KEY ?? "helloworld"

  try {
    const form = new FormData()
    form.append("base64Image", imageData)
    form.append("language",    "eng")
    form.append("OCREngine",   "2")
    form.append("isTable",     "false")
    form.append("detectOrientation", "true")
    form.append("scale",       "true")

    const res = await fetch(OCR_SPACE_URL, {
      method:  "POST",
      headers: { apikey: apiKey },
      body:    form,
      signal:  AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      const msg = await res.text()
      throw new Error(`OCR.space ${res.status}: ${msg.slice(0, 200)}`)
    }

    const json = await res.json() as {
      ParsedResults?: Array<{ ParsedText: string }>
      IsErroredOnProcessing?: boolean
      ErrorMessage?: string
    }

    if (json.IsErroredOnProcessing) {
      throw new Error(json.ErrorMessage ?? "OCR.space processing error")
    }

    const text = json.ParsedResults?.[0]?.ParsedText ?? ""
    return NextResponse.json({ text })

  } catch (err) {
    console.error("[OCR] error:", err)
    return NextResponse.json({ text: "", error: String(err) }, { status: 200 })
  }
}
