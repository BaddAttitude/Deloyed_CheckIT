import { NextRequest, NextResponse } from "next/server"
import { spawn }                     from "child_process"
import path                          from "path"

// Force Node.js runtime — needs child_process / filesystem access
export const runtime = "nodejs"

function runPaddleOCR(base64: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), "scripts", "paddle_ocr.py")

    const py = spawn("python3", [scriptPath], {
      timeout: 60_000,
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    })

    let stdout = ""
    let stderr = ""

    py.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString() })
    py.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString() })

    // Send the raw base64 image to the Python script via stdin
    py.stdin.write(base64)
    py.stdin.end()

    py.on("close", (code: number | null) => {
      if (code !== 0) {
        console.error("[OCR] python3 stderr:", stderr.slice(0, 500))
        reject(new Error(`PaddleOCR exited with code ${code}`))
        return
      }
      try {
        const json = JSON.parse(stdout.trim()) as { text: string; error: string | null }
        if (json.error) reject(new Error(json.error))
        else            resolve(json.text ?? "")
      } catch {
        reject(new Error(`Could not parse PaddleOCR output: ${stdout.slice(0, 200)}`))
      }
    })

    py.on("error", (err: Error) => reject(err))
  })
}

export async function POST(req: NextRequest) {
  let imageData: string
  try {
    const body  = await req.json()
    imageData   = body.imageData
    if (!imageData) throw new Error("missing imageData")
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  try {
    // Strip the data URI prefix — Python only needs raw base64
    const base64 = imageData.replace(/^data:image\/\w+;base64,/, "")
    const text   = await runPaddleOCR(base64)
    return NextResponse.json({ text })
  } catch (err) {
    console.error("[OCR] error:", err)
    return NextResponse.json({ text: "", error: String(err) }, { status: 200 })
  }
}
