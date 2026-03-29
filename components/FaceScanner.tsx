"use client"

import { useRef, useEffect, useState } from "react"
import Webcam from "react-webcam"
import { averageDescriptors } from "@/lib/face-api-loader"
import { loadArcFaceModel } from "@/lib/arcface-loader"
import { computeDescriptorFromLandmarks } from "@/lib/face-descriptor-from-landmarks"
import { loadFaceLandmarker } from "@/lib/mediapipe-face-landmarker"
import type { FaceLandmarkerResult } from "@/lib/mediapipe-face-landmarker"
import { drawMediaPipeMesh } from "@/lib/draw-mediapipe-mesh"

interface FaceScannerProps {
  onCapture: (imageSrc: string, descriptor: Float32Array, cropPixels: string) => void
  onError  : (msg: string) => void
}

// ── Tuning constants ──────────────────────────────────────────────────────────
const STABLE_NEEDED = 10    // frames of stability required before auto-capture
const SCAN_INTERVAL = 300   // ms between detection frames (~3 fps)

// Oval guide matches CSS: w-44 (176 px) × h-52 (208 px), centred in frame
const OVAL_RX = 88    // 176 / 2
const OVAL_RY = 104   // 208 / 2

// Minimum face bounding-box height (in display px) before counting stability.
// 75 % of oval height ≈ 156 px = close-selfie / passport-photo distance.
const MIN_FACE_HEIGHT = Math.round(OVAL_RY * 2 * 0.75)   // ≈ 156 px

// ── Helpers ───────────────────────────────────────────────────────────────────

interface Box { x: number; y: number; width: number; height: number }
interface Lm  { x: number; y: number; z: number }

/** Bounding box from MediaPipe normalised landmarks, scaled to target W × H. */
function getBoundingBox(lms: Lm[], W: number, H: number): Box {
  let minX = W, minY = H, maxX = 0, maxY = 0
  const count = Math.min(lms.length, 468)
  for (let i = 0; i < count; i++) {
    const x = lms[i].x * W, y = lms[i].y * H
    if (x < minX) minX = x;  if (y < minY) minY = y
    if (x > maxX) maxX = x;  if (y > maxY) maxY = y
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

function isFaceInOval(box: Box, dw: number, dh: number): boolean {
  const nx = (box.x + box.width  / 2 - dw / 2) / OVAL_RX
  const ny = (box.y + box.height / 2 - dh / 2) / OVAL_RY
  return nx * nx + ny * ny <= 1
}

/**
 * Returns true when the face is roughly frontal (limited yaw and pitch).
 * Uses MediaPipe landmarks: nose tip (4), face edges (234, 454),
 * forehead (10), and chin (152) to estimate head pose.
 *
 * Yaw  ratio ~0.5 = nose centred between cheeks  → acceptable: 0.35–0.65
 * Pitch ratio ~0.45 = nose ~45 % forehead→chin   → acceptable: 0.35–0.60
 */
function isFaceFrontal(lms: Lm[]): boolean {
  if (lms.length < 468) return false

  const noseX  = lms[4].x
  const leftX  = lms[234].x   // camera-left face edge
  const rightX = lms[454].x   // camera-right face edge
  if (rightX <= leftX) return false
  const yawRatio = (noseX - leftX) / (rightX - leftX)

  const noseY     = lms[4].y
  const foreheadY = lms[10].y
  const chinY     = lms[152].y
  if (chinY <= foreheadY) return false
  const pitchRatio = (noseY - foreheadY) / (chinY - foreheadY)

  return yawRatio > 0.35 && yawRatio < 0.65 &&
         pitchRatio > 0.35 && pitchRatio < 0.60
}

type Status = "loading" | "scanning" | "tooFar" | "tilted" | "detected" | "capturing"

// ─────────────────────────────────────────────────────────────────────────────

export default function FaceScanner({ onCapture, onError }: FaceScannerProps) {
  const webcamRef        = useRef<Webcam>(null)
  const canvasRef        = useRef<HTMLCanvasElement>(null)
  const intervalRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  const capturedRef      = useRef(false)
  const stableRef        = useRef(0)
  const mpRef            = useRef<FaceLandmarkerResult | null>(null)
  const lastLandmarksRef = useRef<Lm[] | null>(null)   // saved from last good frame

  const onCaptureRef = useRef(onCapture)
  const onErrorRef   = useRef(onError)
  onCaptureRef.current = onCapture
  onErrorRef.current   = onError

  const [status,       setStatus]       = useState<Status>("loading")
  const [stableFrames, setStableFrames] = useState(0)

  useEffect(() => {
    let active = true

    Promise.all([loadArcFaceModel(), loadFaceLandmarker()])
      .then(([, mp]) => {
        if (!active) return
        mpRef.current = mp
        setStatus("scanning")

        intervalRef.current = setInterval(() => {
          if (!active || capturedRef.current) return
          if (!webcamRef.current?.video) return
          const video = webcamRef.current.video
          if (video.readyState < 2 || video.offsetWidth === 0) return

          const mp = mpRef.current
          if (!mp) return

          const canvas = canvasRef.current
          if (!canvas) return

          const W = video.offsetWidth, H = video.offsetHeight
          if (canvas.width !== W || canvas.height !== H) {
            canvas.width = W; canvas.height = H
          }

          // ── MediaPipe 468-pt detection (GPU, synchronous) ──────────────────
          let result
          try { result = mp.landmarker.detectForVideo(video, performance.now()) }
          catch { return }

          const faceLms = result.faceLandmarks?.[0]
          const ctx     = canvas.getContext("2d")

          // ── 1. No face ──────────────────────────────────────────────────────
          if (!faceLms?.length) {
            ctx?.clearRect(0, 0, W, H)
            stableRef.current = 0; setStableFrames(0); setStatus("scanning")
            return
          }

          // ── 2. Oval containment check ───────────────────────────────────────
          const box = getBoundingBox(faceLms, W, H)
          if (!isFaceInOval(box, W, H)) {
            ctx?.clearRect(0, 0, W, H)
            stableRef.current = 0; setStableFrames(0); setStatus("scanning")
            return
          }

          // ── 3. Proximity check ─────────────────────────────────────────────
          if (box.height < MIN_FACE_HEIGHT) {
            ctx?.clearRect(0, 0, W, H)
            stableRef.current = 0; setStableFrames(0); setStatus("tooFar")
            return
          }

          // ── 4. Frontal-face check ───────────────────────────────────────────
          if (!isFaceFrontal(faceLms)) {
            ctx?.clearRect(0, 0, W, H)
            stableRef.current = 0; setStableFrames(0); setStatus("tilted")
            return
          }

          // ── 5. Draw 468-pt mesh overlay ─────────────────────────────────────
          drawMediaPipeMesh(canvas, faceLms, mp.connections, true)
          lastLandmarksRef.current = faceLms   // save for capture step

          // ── 6. Count stability ──────────────────────────────────────────────
          stableRef.current = Math.min(stableRef.current + 1, STABLE_NEEDED)
          setStableFrames(stableRef.current)
          setStatus("detected")

          // ── 7. Auto-capture once stable ─────────────────────────────────────
          if (stableRef.current >= STABLE_NEEDED) {
            capturedRef.current = true
            setStatus("capturing")

            const v = webcamRef.current?.video
            if (!v) {
              onErrorRef.current("Camera unavailable")
              capturedRef.current = false; setStatus("detected"); return
            }

            // Collect 3 descriptors using iris-landmark canonical alignment,
            // then average them to reduce per-frame noise.
            ;(async () => {
              try {
                const descriptors: Float32Array[] = []
                let cropPixels = ""
                for (let i = 0; i < 3; i++) {
                  if (i > 0) await new Promise<void>(r => setTimeout(r, 150))
                  if (!active) return
                  const lms = lastLandmarksRef.current
                  if (!lms) break
                  const result = await computeDescriptorFromLandmarks(v, lms)
                  if (result) {
                    descriptors.push(result.descriptor)
                    if (!cropPixels) cropPixels = result.cropPixels
                  }
                }

                if (!active) return

                if (descriptors.length === 0) {
                  capturedRef.current = false; stableRef.current = 0
                  setStableFrames(0); setStatus("detected")
                  return
                }

                const descriptor = descriptors.length === 1
                  ? descriptors[0]
                  : averageDescriptors(descriptors)

                const src = webcamRef.current?.getScreenshot()
                if (src) {
                  onCaptureRef.current(src, descriptor, cropPixels)
                } else {
                  onErrorRef.current("Screenshot failed. Please try again.")
                  capturedRef.current = false; stableRef.current = 0
                  setStableFrames(0); setStatus("detected")
                }
              } catch {
                if (!active) return
                capturedRef.current = false; stableRef.current = 0
                setStableFrames(0); setStatus("detected")
              }
            })()
          }
        }, SCAN_INTERVAL)
      })
      .catch(() => onErrorRef.current("Failed to load face detection models"))

    return () => {
      active = false
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  const progress   = Math.round((stableFrames / STABLE_NEEDED) * 100)
  const isDetected = status === "detected"
  const isTooFar   = status === "tooFar"
  const isTilted   = status === "tilted"
  const isReady    = stableFrames >= STABLE_NEEDED

  return (
    <div className="flex flex-col items-center gap-3 w-full">

      {/* ── Camera viewport ─────────────────────────────────────────────── */}
      <div className={`relative w-full max-w-sm rounded-2xl overflow-hidden border-2 bg-black transition-colors duration-300 ${
        status === "capturing" || (isDetected && isReady) ? "border-green-400"
        : isDetected                                      ? "border-green-400/50"
        : isTooFar                                        ? "border-yellow-400/60"
        : isTilted                                        ? "border-orange-400/60"
        : "border-[#334155]"
      }`}>
        <Webcam
          ref={webcamRef}
          audio={false}
          screenshotFormat="image/jpeg"
          screenshotQuality={0.95}
          videoConstraints={{ facingMode: { ideal: "environment" }, width: 1280, height: 720 }}
          className="w-full aspect-[4/3] object-cover"
        />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

        {/* Stage label */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-[#0f172a]/70 backdrop-blur-sm">
          <span className={`text-xs font-bold tracking-widest uppercase ${
            isDetected ? "text-green-300" : isTooFar ? "text-yellow-300" : isTilted ? "text-orange-300" : "text-[#3b82f6]"
          }`}>Live Face Scan</span>
        </div>

        {/* Oval guide */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className={`w-44 h-52 rounded-full border-2 transition-colors duration-300 ${
            status === "capturing" || (isDetected && isReady) ? "border-green-400"
            : isDetected                                      ? "border-green-400/60"
            : isTooFar                                        ? "border-yellow-400/70"
            : isTilted                                        ? "border-orange-400/70"
            : "border-white/40"
          }`} />
        </div>

        {/* Loading overlay */}
        {status === "loading" && (
          <div className="absolute inset-0 bg-[#0f172a]/80 flex items-center justify-center">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-[#3b82f6] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-sm text-[#94a3b8]">Loading AI models…</p>
            </div>
          </div>
        )}

        {/* Capturing overlay */}
        {status === "capturing" && (
          <div className="absolute inset-0 bg-[#0f172a]/50 flex items-center justify-center">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-green-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-sm text-green-300 font-medium">Capturing…</p>
            </div>
          </div>
        )}

        {/* Scanning / too-far / tilted pulse */}
        {(status === "scanning" || isTooFar || isTilted) && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${isTooFar ? "bg-yellow-400" : isTilted ? "bg-orange-400" : "bg-[#3b82f6]"}`} />
            <span className="text-xs text-white/50">{isTooFar ? "Too far…" : isTilted ? "Face tilted…" : "Scanning…"}</span>
          </div>
        )}
      </div>

      {/* ── Stability progress bar ───────────────────────────────────────── */}
      {isDetected && (
        <div className="w-full max-w-sm">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-[#94a3b8]">Face stability</span>
            <span className={`font-bold ${isReady ? "text-green-400" : "text-[#94a3b8]"}`}>{progress}%</span>
          </div>
          <div className="h-1.5 bg-[#0f172a] rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-150"
              style={{ width: `${progress}%`, background: "linear-gradient(90deg, #16a34a, #4ade80)" }} />
          </div>
        </div>
      )}

      {/* ── Status message ───────────────────────────────────────────────── */}
      <div className={`flex items-center gap-2.5 text-sm font-medium px-4 py-2.5 rounded-lg w-full max-w-sm border transition-colors ${
        status === "capturing" || (isDetected && isReady)
          ? "text-green-300 bg-green-500/10 border-green-400/40"
          : isDetected
          ? "text-green-300/70 bg-green-500/5 border-green-500/20"
          : isTooFar
          ? "text-yellow-300 bg-yellow-500/10 border-yellow-400/30"
          : isTilted
          ? "text-orange-300 bg-orange-500/10 border-orange-400/30"
          : "text-[#94a3b8] bg-[#1e293b] border-[#334155]"
      }`}>
        {status === "capturing" || isReady
          ? <div className="w-3 h-3 rounded-full border-2 border-green-400 border-t-transparent animate-spin flex-shrink-0" />
          : isDetected
          ? <div className="w-3 h-3 rounded-full border-2 border-green-400/60 border-t-transparent animate-spin flex-shrink-0" />
          : isTooFar
          ? <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse flex-shrink-0" />
          : isTilted
          ? <div className="w-2 h-2 bg-orange-400 rounded-full animate-pulse flex-shrink-0" />
          : <div className="w-2 h-2 bg-[#475569] rounded-full animate-pulse flex-shrink-0" />
        }
        <span className="flex-1">
          {status === "capturing"  ? "Capturing live face…"
           : isReady               ? "Hold still — capturing…"
           : isDetected            ? "Hold still…"
           : isTooFar              ? "Move closer — fill the oval"
           : isTilted              ? "Look straight at the camera"
           : "Position your face inside the oval"}
        </span>
      </div>

    </div>
  )
}
