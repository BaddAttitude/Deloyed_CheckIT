import { NextRequest, NextResponse } from "next/server"
import { createWorker } from "tesseract.js"
import path from "path"

// Force Node.js runtime — Tesseract.js workers require worker_threads
export const runtime = "nodejs"

// process.cwd() is evaluated at runtime (not replaced by Turbopack bundler),
// so it correctly resolves to the project root on Windows.
const PROJECT_ROOT  = process.cwd()
const WORKER_SCRIPT = path.join(PROJECT_ROOT, "node_modules", "tesseract.js", "src", "worker-script", "node", "index.js")
const LANG_CACHE    = path.join(PROJECT_ROOT, ".tessdata")   // language model cached here after first download

export async function POST(req: NextRequest) {
  let imageData: string
  try {
    const body = await req.json()
    imageData = body.imageData
    if (!imageData) throw new Error("missing imageData")
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  let worker
  try {
    worker = await createWorker("eng", 1, {
      workerPath:  WORKER_SCRIPT,
      langPath:    LANG_CACHE,
      cacheMethod: "write",       // download once, reuse from disk
    })
    const { data: { text } } = await worker.recognize(imageData)
    await worker.terminate()
    return NextResponse.json({ text: text ?? "" })
  } catch (err) {
    if (worker) {
      try { await worker.terminate() } catch { /* ignore */ }
    }
    console.error("[OCR] error:", err)
    return NextResponse.json({ text: "", error: String(err) }, { status: 200 })
  }
}
