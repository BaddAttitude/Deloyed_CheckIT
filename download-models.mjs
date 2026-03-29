import https from "https"
import fs from "fs"
import path from "path"

// ── face-api.js weights ───────────────────────────────────────────────────────
const FACEAPI_BASE  = "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights"
const FACEAPI_DIR   = "./public/models"

const FACEAPI_FILES = [
  "ssd_mobilenetv1_model-weights_manifest.json",
  "ssd_mobilenetv1_model-shard1",
  "ssd_mobilenetv1_model-shard2",
  "face_landmark_68_model-weights_manifest.json",
  "face_landmark_68_model-shard1",
  "face_recognition_model-weights_manifest.json",
  "face_recognition_model-shard1",
  "face_recognition_model-shard2",
  "face_expression_model-weights_manifest.json",
  "face_expression_model-shard1",
]

// ── MediaPipe ─────────────────────────────────────────────────────────────────
const MP_DIR        = "./public/mediapipe"
const MP_WASM_SRC   = "./node_modules/@mediapipe/tasks-vision/wasm"
const MP_WASM_DEST  = "./public/mediapipe/wasm"

// face_landmarker.task — float16 quantised model (~4.7 MB)
const MP_MODEL_URL  = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
const MP_MODEL_DEST = "./public/mediapipe/face_landmarker.task"

// ── Helpers ───────────────────────────────────────────────────────────────────

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    const get = (u) =>
      https.get(u, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return get(res.headers.location)
        }
        res.pipe(file)
        file.on("finish", () => { file.close(); resolve() })
      }).on("error", (e) => { fs.unlink(dest, () => {}); reject(e) })
    get(url)
    file.on("error", reject)
  })
}

// ── 1. face-api.js weights ────────────────────────────────────────────────────
console.log("── face-api.js model weights ────────────────────────────────")
fs.mkdirSync(FACEAPI_DIR, { recursive: true })

for (const f of FACEAPI_FILES) {
  process.stdout.write(`  ${f}... `)
  try {
    await downloadFile(`${FACEAPI_BASE}/${f}`, path.join(FACEAPI_DIR, f))
    console.log("done")
  } catch (e) {
    console.log(`FAILED: ${e.message}`)
  }
}

// ── 2. MediaPipe WASM runtime (copy from node_modules) ───────────────────────
console.log("\n── MediaPipe WASM runtime ───────────────────────────────────")
fs.mkdirSync(MP_WASM_DEST, { recursive: true })

for (const f of fs.readdirSync(MP_WASM_SRC)) {
  const src  = path.join(MP_WASM_SRC,  f)
  const dest = path.join(MP_WASM_DEST, f)
  fs.copyFileSync(src, dest)
  console.log(`  ${f}... done`)
}

// ── 3. MediaPipe face_landmarker.task model ───────────────────────────────────
console.log("\n── MediaPipe face_landmarker.task (~4.7 MB) ─────────────────")
fs.mkdirSync(MP_DIR, { recursive: true })
process.stdout.write("  face_landmarker.task... ")
try {
  await downloadFile(MP_MODEL_URL, MP_MODEL_DEST)
  console.log("done")
} catch (e) {
  console.log(`FAILED: ${e.message}`)
}

console.log("\n✓ All models ready.\n")
