/**
 * download-arcface.mjs
 *
 * Sets up everything needed to run ArcFace MobileFaceNet in the browser:
 *
 *  1. Copies ONNX Runtime Web WASM files → public/ort/
 *  2. Downloads InsightFace MobileFaceNet model → public/models/w600k_mbf.onnx
 *
 * Run once after npm install:
 *   node download-arcface.mjs
 */

import https from "https"
import fs   from "fs"
import path from "path"

// ── 1. ONNX Runtime Web WASM files ───────────────────────────────────────────
// Copied from node_modules so the browser can load the runtime offline.

const ORT_SRC  = "./node_modules/onnxruntime-web/dist"
const ORT_DEST = "./public/ort"

console.log("── ONNX Runtime Web WASM ────────────────────────────────────")
fs.mkdirSync(ORT_DEST, { recursive: true })

const wasmFiles = fs.readdirSync(ORT_SRC).filter(f => f.endsWith(".wasm") || f.endsWith(".mjs") || f.endsWith(".min.js"))
for (const f of wasmFiles) {
  fs.copyFileSync(path.join(ORT_SRC, f), path.join(ORT_DEST, f))
  console.log(`  ${f}... done`)
}

// ── 2. ArcFace MobileFaceNet model ───────────────────────────────────────────
// InsightFace w600k_mbf.onnx — MobileFaceNet trained on WebFace600K
// Model size: ~4.3 MB

const MODEL_URL  = "https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_sc.zip"
const MODEL_DEST = "./public/models/w600k_mbf.onnx"
const ZIP_TMP    = "./tmp_buffalo_sc.zip"
const EXTRACT_DIR = "./tmp_buffalo_sc"

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    const get  = (u) =>
      https.get(u, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          file.close()
          fs.unlinkSync(dest)
          return downloadFile(res.headers.location, dest).then(resolve).catch(reject)
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${u}`))
          return
        }
        res.pipe(file)
        file.on("finish", () => { file.close(); resolve() })
      }).on("error", reject)
    get(url)
  })
}

console.log("\n── ArcFace MobileFaceNet model (~4.3 MB) ────────────────────")

if (fs.existsSync(MODEL_DEST)) {
  console.log("  w600k_mbf.onnx already exists — skipping download")
} else {
  console.log("  Downloading buffalo_sc.zip from InsightFace GitHub releases…")

  try {
    await downloadFile(MODEL_URL, ZIP_TMP)
    console.log("  Download complete. Extracting w600k_mbf.onnx…")

    // Extract using PowerShell (Windows) or unzip (Mac/Linux)
    const { execSync } = await import("child_process")
    fs.mkdirSync(EXTRACT_DIR, { recursive: true })

    if (process.platform === "win32") {
      execSync(`powershell -command "Expand-Archive -Path '${ZIP_TMP}' -DestinationPath '${EXTRACT_DIR}' -Force"`)
    } else {
      execSync(`unzip -o "${ZIP_TMP}" -d "${EXTRACT_DIR}"`)
    }

    // Find w600k_mbf.onnx anywhere in the extracted directory
    function findFile(dir, name) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) { const found = findFile(full, name); if (found) return found }
        else if (entry.name === name) return full
      }
      return null
    }

    const found = findFile(EXTRACT_DIR, "w600k_mbf.onnx")
    if (!found) throw new Error("w600k_mbf.onnx not found in extracted archive")

    fs.copyFileSync(found, MODEL_DEST)
    console.log("  w600k_mbf.onnx → public/models/w600k_mbf.onnx  done")

    // Clean up temp files
    fs.rmSync(ZIP_TMP,      { force: true })
    fs.rmSync(EXTRACT_DIR,  { recursive: true, force: true })

  } catch (err) {
    // Clean up on failure
    fs.rmSync(ZIP_TMP,     { force: true })
    fs.rmSync(EXTRACT_DIR, { recursive: true, force: true })

    console.log(`\n  ⚠  Automatic download failed: ${err.message}`)
    console.log("  Please download manually:")
    console.log("    1. Go to: https://github.com/deepinsight/insightface/releases/tag/v0.7")
    console.log("    2. Download: buffalo_sc.zip")
    console.log("    3. Extract w600k_mbf.onnx → public/models/w600k_mbf.onnx")
  }
}

// ── 3. ArcFace R50 client model ───────────────────────────────────────────────
// Served to the browser for client-side inference via /models/w600k_r50.onnx.
// Loaded lazily — only fetched when an ambiguous case (0.25–0.75) is detected.

const R50_ZIP  = "https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_m.zip"
const R50_TMP  = "./tmp_buffalo_m.zip"
const R50_DIR  = "./tmp_buffalo_m"
const R50_DEST = "./public/models/w600k_r50.onnx"

console.log("\n── ArcFace R50 client model (~85 MB) ────────────────────────")

if (fs.existsSync(R50_DEST)) {
  console.log("  w600k_r50.onnx already exists — skipping download")
} else {
  fs.mkdirSync("./public/models", { recursive: true })
  console.log("  Downloading buffalo_m.zip from InsightFace GitHub releases…")

  try {
    await downloadFile(R50_ZIP, R50_TMP)
    console.log("  Download complete. Extracting w600k_r50.onnx…")

    const { execSync } = await import("child_process")
    fs.mkdirSync(R50_DIR, { recursive: true })

    if (process.platform === "win32") {
      execSync(`powershell -command "Expand-Archive -Path '${R50_TMP}' -DestinationPath '${R50_DIR}' -Force"`)
    } else {
      execSync(`unzip -o "${R50_TMP}" -d "${R50_DIR}"`)
    }

    function findFile(dir, name) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) { const found = findFile(full, name); if (found) return found }
        else if (entry.name === name) return full
      }
      return null
    }

    const found = findFile(R50_DIR, "w600k_r50.onnx")
    if (!found) throw new Error("w600k_r50.onnx not found in archive")

    fs.copyFileSync(found, R50_DEST)
    console.log("  w600k_r50.onnx → public/models/w600k_r50.onnx  done")

    fs.rmSync(R50_TMP, { force: true })
    fs.rmSync(R50_DIR, { recursive: true, force: true })

  } catch (err) {
    fs.rmSync(R50_TMP, { force: true })
    fs.rmSync(R50_DIR, { recursive: true, force: true })
    console.log(`\n  ⚠  R50 download failed: ${err.message}`)
    console.log("  The app still works using MobileFaceNet only.")
    console.log("  To enable the hybrid mode manually:")
    console.log("    1. Go to: https://github.com/deepinsight/insightface/releases/tag/v0.7")
    console.log("    2. Download: buffalo_m.zip")
    console.log("    3. Extract w600k_r50.onnx → server-models/w600k_r50.onnx")
  }
}

console.log("\n✓ ArcFace setup complete.\n")
