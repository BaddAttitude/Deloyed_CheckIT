import { NextRequest, NextResponse } from "next/server"
import { computeR50Descriptor }     from "@/lib/arcface-server"
import fs                            from "fs"
import path                          from "path"

function cosineDistance(a: Float32Array, b: Float32Array): number {
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
  return 1 - dot
}

/** Check model file exists — avoids a confusing ONNX error on missing file */
function modelReady(): boolean {
  return fs.existsSync(
    path.join(process.cwd(), "server-models", "w600k_r50.onnx")
  )
}

export async function POST(req: NextRequest) {
  if (!modelReady()) {
    // R50 model not downloaded yet — client should fall back to MobileFaceNet result
    return NextResponse.json(
      { error: "R50 model not available" },
      { status: 503 }
    )
  }

  try {
    const { idCrop, liveCrop } = await req.json() as {
      idCrop  : string
      liveCrop: string
    }

    if (!idCrop || !liveCrop) {
      return NextResponse.json({ error: "Missing crop data" }, { status: 400 })
    }

    // Run both descriptors in parallel
    const [idDesc, liveDesc] = await Promise.all([
      computeR50Descriptor(idCrop),
      computeR50Descriptor(liveCrop),
    ])

    const distance = cosineDistance(idDesc, liveDesc)
    return NextResponse.json({ distance, source: "r50" })

  } catch (err) {
    console.error("[face-match]", err)
    return NextResponse.json({ error: "Inference failed" }, { status: 500 })
  }
}
