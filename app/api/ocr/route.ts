import { NextRequest, NextResponse } from "next/server"

// Force Node.js runtime
export const runtime = "nodejs"

const OCR_ENDPOINT = "https://api.ocr.space/parse/base64"

export async function POST(req: NextRequest) {
  let imageData: string
  try {
    const body = await req.json()
    imageData = body.imageData
    if (!imageData) throw new Error("missing imageData")
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  try {
    // Ensure data URI prefix is present
    const base64Image = imageData.startsWith("data:")
      ? imageData
      : `data:image/jpeg;base64,${imageData}`

    const params = new URLSearchParams({
      base64Image,
      language:           "eng",
      OCREngine:          "2",     // OCR.space engine 2 — best for typed documents / ID cards
      scale:              "true",  // auto-scale small text up before OCR
      isOverlayRequired:  "false",
      detectOrientation:  "true",  // auto-rotate if needed
      isTable:            "false",
    })

    const res = await fetch(OCR_ENDPOINT, {
      method:  "POST",
      headers: {
        apikey:          process.env.OCR_SPACE_KEY ?? "helloworld",
        "Content-Type":  "application/x-www-form-urlencoded",
      },
      body:   params.toString(),
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) throw new Error(`OCR.space responded with ${res.status}`)

    const json = await res.json() as {
      IsErroredOnProcessing: boolean
      ErrorMessage?:         string[]
      ParsedResults?:        Array<{ ParsedText: string; FileParseExitCode: number }>
    }

    if (json.IsErroredOnProcessing) {
      throw new Error(json.ErrorMessage?.[0] ?? "OCR processing failed")
    }

    const text = json.ParsedResults?.[0]?.ParsedText ?? ""
    return NextResponse.json({ text })

  } catch (err) {
    console.error("[OCR] error:", err)
    return NextResponse.json({ text: "", error: String(err) }, { status: 200 })
  }
}
