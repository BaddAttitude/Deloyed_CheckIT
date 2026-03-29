"use client"

/**
 * Singleton loader for MediaPipe FaceLandmarker (468-point face mesh).
 *
 * WASM runtime and model are served from /public/mediapipe/ so the app
 * works fully offline after the first load.
 *
 * Usage:
 *   const { landmarker, connections } = await loadFaceLandmarker()
 *   const result = landmarker.detectForVideo(videoEl, performance.now())
 *   drawMediaPipeMesh(canvas, result.faceLandmarks[0], connections)
 */

export interface MpConnection {
  start: number
  end: number
}

export interface MeshConnections {
  tesselation : MpConnection[]
  rightEye    : MpConnection[]
  leftEye     : MpConnection[]
  rightEyebrow: MpConnection[]
  leftEyebrow : MpConnection[]
  faceOval    : MpConnection[]
  lips        : MpConnection[]
  rightIris   : MpConnection[]
  leftIris    : MpConnection[]
}

export interface FaceLandmarkerResult {
  landmarker  : import("@mediapipe/tasks-vision").FaceLandmarker
  connections : MeshConnections
}

let cached: FaceLandmarkerResult | null = null
let promise: Promise<FaceLandmarkerResult> | null = null

export async function loadFaceLandmarker(): Promise<FaceLandmarkerResult> {
  if (cached)  return cached
  if (promise) return promise

  promise = (async (): Promise<FaceLandmarkerResult> => {
    // Dynamic import keeps @mediapipe/tasks-vision out of the SSR bundle
    const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision")

    // MediaPipe's TFLite runtime logs "INFO: ..." diagnostics to console.error.
    // Suppress them so they don't trigger the Next.js dev overlay.
    const _origError = console.error
    console.error = (...args: unknown[]) => {
      if (typeof args[0] === "string" && args[0].startsWith("INFO:")) return
      _origError.apply(console, args)
    }

    const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm")

    // Try GPU delegate first (faster on Android/desktop).
    // Fall back to CPU on iOS Safari where WebGL compute shaders are unreliable.
    let landmarker: import("@mediapipe/tasks-vision").FaceLandmarker
    try {
      landmarker = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath : "/mediapipe/face_landmarker.task",
          delegate       : "GPU",
        },
        outputFaceBlendshapes : false,
        runningMode           : "VIDEO",
        numFaces              : 1,
      })
      // Smoke-test: if the GPU delegate silently produced a broken instance,
      // detectForVideo will throw on first call — that's handled in the scan loop.
    } catch {
      landmarker = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath : "/mediapipe/face_landmarker.task",
          delegate       : "CPU",
        },
        outputFaceBlendshapes : false,
        runningMode           : "VIDEO",
        numFaces              : 1,
      })
    }

    // Capture the static connection arrays once (they never change)
    const connections: MeshConnections = {
      tesselation : [...FaceLandmarker.FACE_LANDMARKS_TESSELATION],
      rightEye    : [...FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE],
      leftEye     : [...FaceLandmarker.FACE_LANDMARKS_LEFT_EYE],
      rightEyebrow: [...FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW],
      leftEyebrow : [...FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW],
      faceOval    : [...FaceLandmarker.FACE_LANDMARKS_FACE_OVAL],
      lips        : [...FaceLandmarker.FACE_LANDMARKS_LIPS],
      rightIris   : [...FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS],
      leftIris    : [...FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS],
    }

    cached = { landmarker, connections }
    return cached
  })()

  return promise
}
