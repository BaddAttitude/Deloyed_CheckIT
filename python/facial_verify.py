#!/usr/bin/env python3
"""
facial_verify.py — CheckIt Python Facial Verification
======================================================
Compares a stored reference photo (e.g. an ID card photo) against a live
webcam capture using:
  - MediaPipe  → face detection + alignment
  - DeepFace   → face embedding (Facenet512 / ArcFace)
  - OpenCV     → webcam capture + display

Usage
-----
  python facial_verify.py path/to/reference.jpg
  python facial_verify.py path/to/reference.jpg --model ArcFace --camera 1
  python facial_verify.py path/to/reference.jpg --no-liveness   # skip blink check

Install dependencies
--------------------
  pip install -r requirements.txt
"""

import argparse
import math
import os
import sys
import time
from typing import Optional, Tuple

import cv2
import mediapipe as mp
import numpy as np

# DeepFace is imported inside get_embedding() to keep startup fast.
# It downloads model weights on first use (~100 MB for Facenet512).

# ── Tuning constants ───────────────────────────────────────────────────────────
MATCH_THRESHOLD  = 0.40   # cosine distance < this → "Match"  (0=identical, 2=opposite)
                           # 0.40 ≈ 60 % similarity — mirrors the web app threshold
EAR_BLINK_THRESH = 0.21   # Eye Aspect Ratio below this = eye closed
BLINKS_REQUIRED  = 2      # blinks needed to pass liveness check
LIVENESS_TIMEOUT = 20     # seconds the user has to blink
STABLE_FRAMES    = 15     # consecutive frames the face must be centred before capture
DEBUG_SAVE_PATH  = "debug_live_capture.jpg"   # saved after capture for inspection

# MediaPipe Face Mesh landmark indices used for blink detection (6 per eye)
# Order: [outer, top-outer, top-inner, inner, bottom-inner, bottom-outer]
_LEFT_EYE_PTS  = [362, 385, 387, 263, 373, 380]
_RIGHT_EYE_PTS = [33,  160, 158, 133, 153, 144]

# Iris-centre landmarks (only available when refine_landmarks=True)
_IRIS_LEFT  = 468   # person's left  eye iris centre
_IRIS_RIGHT = 473   # person's right eye iris centre

# ── MediaPipe singletons ───────────────────────────────────────────────────────
_mp_face_mesh   = mp.solutions.face_mesh
_mp_face_detect = mp.solutions.face_detection
_mp_drawing     = mp.solutions.drawing_utils
_mp_styles      = mp.solutions.drawing_styles


# ══════════════════════════════════════════════════════════════════════════════
# Helper
# ══════════════════════════════════════════════════════════════════════════════

def _ear(landmarks, eye_idx: list, w: int, h: int) -> float:
    """
    Eye Aspect Ratio (Soukupová & Čech, 2016).
    EAR = (||p2-p6|| + ||p3-p5||) / (2 · ||p1-p4||)
    Drops sharply when the eye closes.
    """
    pts = [(landmarks[i].x * w, landmarks[i].y * h) for i in eye_idx]
    A = math.dist(pts[1], pts[5])
    B = math.dist(pts[2], pts[4])
    C = math.dist(pts[0], pts[3])
    return (A + B) / (2.0 * C) if C > 0 else 0.0


# ══════════════════════════════════════════════════════════════════════════════
# 1. capture_live_image
# ══════════════════════════════════════════════════════════════════════════════

def capture_live_image(
    camera_index: int = 0,
    skip_liveness: bool = False,
) -> Optional[np.ndarray]:
    """
    Open the webcam, display a live feed with face-mesh overlay and liveness
    prompts, then auto-capture a stable frame once the user has blinked
    BLINKS_REQUIRED times.

    Parameters
    ----------
    camera_index  : int  — OS index of the webcam (default 0)
    skip_liveness : bool — bypass blink check (debug mode)

    Returns
    -------
    BGR numpy array of the captured frame, or None on failure / timeout / quit.
    """
    cap = cv2.VideoCapture(camera_index, cv2.CAP_DSHOW)   # CAP_DSHOW = faster init on Windows
    if not cap.isOpened():
        print(f"[ERROR] Cannot open camera index {camera_index}.")
        return None

    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

    face_mesh = _mp_face_mesh.FaceMesh(
        max_num_faces=1,
        refine_landmarks=True,           # enables iris landmarks at indices 468 / 473
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    )

    blink_count  = 0
    eye_was_open = True     # debounce: only count one blink per open→close→open cycle
    stable_count = 0
    liveness_ok  = skip_liveness
    start_time   = time.time()
    captured: Optional[np.ndarray] = None
    WIN = "CheckIt — Live Scan  (Q = quit)"

    print()
    if skip_liveness:
        print("[INFO] Liveness check skipped. Hold your face in the oval and hold still.")
    else:
        print(f"[INFO] Blink {BLINKS_REQUIRED}× to prove liveness, then hold still for auto-capture.")
    print()

    while True:
        ret, frame = cap.read()
        if not ret:
            print("[ERROR] Camera read failed.")
            break

        frame = cv2.flip(frame, 1)          # mirror — feels natural for selfie
        h, w  = frame.shape[:2]
        rgb   = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        # ── Liveness timeout check ─────────────────────────────────────────────
        elapsed = time.time() - start_time
        if not liveness_ok and elapsed > LIVENESS_TIMEOUT:
            print("[WARN] Liveness timeout. Restart the script and blink within "
                  f"{LIVENESS_TIMEOUT}s.")
            break

        results = face_mesh.process(rgb)
        overlay = frame.copy()

        status_text  = ""
        status_color = (120, 120, 120)

        if results.multi_face_landmarks:
            lms = results.multi_face_landmarks[0].landmark

            # ── Blink detection ───────────────────────────────────────────────
            if not liveness_ok:
                avg_ear = (_ear(lms, _LEFT_EYE_PTS, w, h) +
                           _ear(lms, _RIGHT_EYE_PTS, w, h)) / 2.0

                if eye_was_open and avg_ear < EAR_BLINK_THRESH:
                    blink_count += 1
                    eye_was_open = False
                    print(f"  Blink {blink_count}/{BLINKS_REQUIRED}  "
                          f"(EAR={avg_ear:.3f})")
                elif avg_ear >= EAR_BLINK_THRESH:
                    eye_was_open = True

                if blink_count >= BLINKS_REQUIRED:
                    liveness_ok = True
                    print("[INFO] Liveness PASSED ✓ — hold still…")

                status_text  = (f"Blink {blink_count}/{BLINKS_REQUIRED}  |  "
                                f"{int(LIVENESS_TIMEOUT - elapsed)}s left")
                status_color = (30, 180, 255)          # amber-blue

            # ── Stability counter / auto-capture ──────────────────────────────
            else:
                stable_count += 1
                remaining = STABLE_FRAMES - stable_count

                if remaining > 0:
                    status_text  = f"Hold still…  ({remaining})"
                    status_color = (60, 220, 60)
                else:
                    captured = frame.copy()
                    # Flash green on the frame
                    green_flash = np.zeros_like(overlay)
                    green_flash[:] = (0, 200, 80)
                    overlay = cv2.addWeighted(overlay, 0.6, green_flash, 0.4, 0)
                    cv2.putText(overlay, "CAPTURED", (w // 2 - 90, h // 2 + 10),
                                cv2.FONT_HERSHEY_SIMPLEX, 1.6, (0, 255, 100), 3)
                    cv2.imshow(WIN, overlay)
                    cv2.waitKey(900)
                    break

            # ── Draw face mesh overlay ─────────────────────────────────────────
            _mp_drawing.draw_landmarks(
                image=overlay,
                landmark_list=results.multi_face_landmarks[0],
                connections=_mp_face_mesh.FACEMESH_TESSELATION,
                landmark_drawing_spec=None,
                connection_drawing_spec=_mp_styles.get_default_face_mesh_tesselation_style(),
            )
            _mp_drawing.draw_landmarks(
                image=overlay,
                landmark_list=results.multi_face_landmarks[0],
                connections=_mp_face_mesh.FACEMESH_CONTOURS,
                landmark_drawing_spec=None,
                connection_drawing_spec=_mp_styles.get_default_face_mesh_contours_style(),
            )

        else:
            # No face in frame
            stable_count = 0
            if liveness_ok:
                status_text  = "Face lost — hold still"
                status_color = (60, 80, 220)
            else:
                status_text  = "No face detected"
                status_color = (60, 60, 200)

        # ── HUD overlay ───────────────────────────────────────────────────────
        # Top bar
        cv2.rectangle(overlay, (0, 0), (w, 52), (15, 23, 42), -1)
        cv2.putText(overlay, "CheckIt  Live Scan", (12, 35),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.85, (59, 130, 246), 2)
        cv2.putText(overlay, status_text, (w - len(status_text) * 11 - 10, 35),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.65, status_color, 2)

        # Oval guide (matches web app: ~w-44 × h-52 ≈ 176 × 208 px at 384px wide)
        # Scaled to window: use ~23 % of width and 29 % of height
        ox, oy = int(w * 0.23), int(h * 0.30)
        oval_color = (60, 220, 60) if liveness_ok else (180, 180, 180)
        cv2.ellipse(overlay, (w // 2, h // 2), (ox, oy), 0, 0, 360, oval_color, 2)

        cv2.imshow(WIN, overlay)
        key = cv2.waitKey(1) & 0xFF
        if key in (ord('q'), 27):
            print("[INFO] Quit by user.")
            break

    cap.release()
    cv2.destroyAllWindows()
    face_mesh.close()
    return captured


# ══════════════════════════════════════════════════════════════════════════════
# 2. detect_and_align_face
# ══════════════════════════════════════════════════════════════════════════════

def detect_and_align_face(
    image: np.ndarray,
    label: str = "image",
    min_confidence: float = 0.4,
) -> Optional[np.ndarray]:
    """
    Locate the face in the image using MediaPipe Face Detection, then rotate
    to align the eyes horizontally using Face Mesh iris landmarks.

    Parameters
    ----------
    image          : BGR numpy array
    label          : name used in error messages (e.g. "reference" / "live")
    min_confidence : detection confidence threshold — use 0.3 for printed photos

    Returns
    -------
    224×224 BGR aligned face crop, or None on failure.

    Raises
    ------
    ValueError if more than one face is detected (caller decides how to proceed).
    """
    h, w = image.shape[:2]
    rgb  = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

    with _mp_face_detect.FaceDetection(
        model_selection=1,                # model 1 handles faces up to ~5 m
        min_detection_confidence=min_confidence,
    ) as detector:
        det = detector.process(rgb)

    if not det.detections:
        print(f"[ERROR] No face detected in {label}.")
        return None

    if len(det.detections) > 1:
        raise ValueError(
            f"{len(det.detections)} faces found in {label}. "
            "Please use an image with exactly one face."
        )

    # ── Bounding box with 20 % padding ────────────────────────────────────────
    bb  = det.detections[0].location_data.relative_bounding_box
    pad = 0.20
    x1  = max(0, int((bb.xmin - pad * bb.width)  * w))
    y1  = max(0, int((bb.ymin - pad * bb.height) * h))
    x2  = min(w, int((bb.xmin + (1 + pad) * bb.width)  * w))
    y2  = min(h, int((bb.ymin + (1 + pad) * bb.height) * h))

    crop = image[y1:y2, x1:x2]
    if crop.size == 0:
        print(f"[ERROR] Crop is empty for {label}.")
        return None

    # ── Align (rotate so eyes are level) ──────────────────────────────────────
    aligned = _align_by_eyes(crop) or crop    # fallback to unrotated crop

    return cv2.resize(aligned, (224, 224), interpolation=cv2.INTER_AREA)


def _align_by_eyes(crop: np.ndarray) -> Optional[np.ndarray]:
    """
    Use MediaPipe Face Mesh iris centres to calculate the roll angle of the
    face and rotate the crop so the inter-eye line is horizontal.
    """
    h, w = crop.shape[:2]
    rgb  = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)

    with _mp_face_mesh.FaceMesh(
        max_num_faces=1,
        refine_landmarks=True,
        min_detection_confidence=0.3,
        min_tracking_confidence=0.3,
    ) as mesh:
        res = mesh.process(rgb)

    if not res.multi_face_landmarks:
        return None

    lms = res.multi_face_landmarks[0].landmark

    # Iris centre coordinates (only available with refine_landmarks=True)
    try:
        lx = lms[_IRIS_LEFT].x  * w;  ly = lms[_IRIS_LEFT].y  * h
        rx = lms[_IRIS_RIGHT].x * w;  ry = lms[_IRIS_RIGHT].y * h
    except IndexError:
        return None

    # Angle of the line connecting both eye centres
    angle  = math.degrees(math.atan2(ry - ly, rx - lx))
    centre = (int((lx + rx) / 2), int((ly + ry) / 2))

    M       = cv2.getRotationMatrix2D(centre, angle, 1.0)
    rotated = cv2.warpAffine(crop, M, (w, h),
                             flags=cv2.INTER_LINEAR,
                             borderMode=cv2.BORDER_REFLECT_101)
    return rotated


# ══════════════════════════════════════════════════════════════════════════════
# 3. get_embedding
# ══════════════════════════════════════════════════════════════════════════════

def get_embedding(
    face_crop: np.ndarray,
    label: str = "face",
    model_name: str = "Facenet512",
) -> Optional[np.ndarray]:
    """
    Extract a face embedding using DeepFace.

    The crop is already isolated and aligned, so we skip DeepFace's internal
    detector (detector_backend="skip") and alignment (align=False).

    Parameters
    ----------
    face_crop  : 224×224 BGR numpy array
    label      : name used in error messages
    model_name : DeepFace model — "Facenet512" (default), "ArcFace", "VGG-Face"

    Returns
    -------
    L2-normalised 1-D numpy float32 embedding, or None on failure.
    """
    from deepface import DeepFace   # lazy import — weights downloaded on first call

    try:
        result = DeepFace.represent(
            img_path          = face_crop,
            model_name        = model_name,
            enforce_detection = False,     # crop already contains only the face
            detector_backend  = "skip",    # skip re-detection
            align             = False,     # already aligned
        )
    except Exception as exc:
        print(f"[ERROR] Embedding failed for {label}: {exc}")
        return None

    if not result:
        print(f"[ERROR] Empty embedding result for {label}.")
        return None

    emb  = np.array(result[0]["embedding"], dtype=np.float32)

    # L2-normalise: makes cosine similarity = dot product
    norm = np.linalg.norm(emb)
    return emb / norm if norm > 0 else emb


# ══════════════════════════════════════════════════════════════════════════════
# 4. compare_faces
# ══════════════════════════════════════════════════════════════════════════════

def compare_faces(
    emb_ref: np.ndarray,
    emb_live: np.ndarray,
    threshold: float = MATCH_THRESHOLD,
) -> Tuple[float, bool]:
    """
    Compare two L2-normalised embeddings using cosine distance.

    cosine_distance = 1 − dot(a, b)
      Range [0, 2]:  0 = identical vectors,  2 = opposite vectors
      For face embeddings:  < 0.40 ≈ same person,  ≥ 0.40 ≈ different person

    Returns
    -------
    (distance, is_match)
      distance  — float; lower is more similar
      is_match  — True if distance < threshold
    """
    distance = float(1.0 - np.dot(emb_ref, emb_live))
    return distance, distance < threshold


# ══════════════════════════════════════════════════════════════════════════════
# Result display helpers
# ══════════════════════════════════════════════════════════════════════════════

def _print_result(distance: float, is_match: bool, threshold: float) -> None:
    similarity_pct = max(0.0, (1.0 - distance) * 100.0)
    bar_len    = 40
    filled     = int(bar_len * similarity_pct / 100)
    bar        = "█" * filled + "░" * (bar_len - filled)
    color_ok   = "\033[92m"   # green
    color_fail = "\033[91m"   # red
    color_dim  = "\033[90m"
    reset      = "\033[0m"
    color      = color_ok if is_match else color_fail

    print()
    print("═" * 52)
    print("  CheckIt — Facial Verification Result")
    print("═" * 52)
    print(f"  Cosine distance : {color}{distance:.4f}{reset}")
    print(f"  Similarity      : {color}{similarity_pct:.1f} %{reset}")
    print(f"  {color_dim}[{bar}]{reset}")
    print(f"  Threshold       : < {threshold:.2f}  "
          f"({color_dim}= {(1 - threshold)*100:.0f} % similarity{reset})")
    print("─" * 52)
    if is_match:
        print(f"  Result          : {color_ok}✅  MATCH — Same person{reset}")
    else:
        print(f"  Result          : {color_fail}❌  NO MATCH — Different person{reset}")
    print("═" * 52)
    print()


def _show_comparison(ref_crop: np.ndarray, live_crop: np.ndarray,
                     is_match: bool, similarity_pct: float) -> None:
    """Display a side-by-side window: reference | divider | live."""
    ref_disp  = cv2.resize(ref_crop,  (224, 224))
    live_disp = cv2.resize(live_crop, (224, 224))
    divider   = np.full((224, 6, 3), 60, dtype=np.uint8)

    panel = np.hstack([ref_disp, divider, live_disp])

    # Labels
    cv2.putText(panel, "Reference ID",  (6,  218), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (180, 180, 180), 1)
    cv2.putText(panel, "Live capture",  (234, 218), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (180, 180, 180), 1)

    verdict_color = (60, 200, 60) if is_match else (60, 60, 200)
    verdict_text  = f"{'MATCH' if is_match else 'NO MATCH'}  {similarity_pct:.1f}%"
    cv2.putText(panel, verdict_text, (8, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.55, verdict_color, 1)

    # Coloured border
    border_color = (60, 200, 60) if is_match else (60, 60, 200)
    panel = cv2.copyMakeBorder(panel, 3, 3, 3, 3,
                               cv2.BORDER_CONSTANT, value=border_color)

    cv2.imshow("Verification Result  (any key to close)", panel)
    print("[INFO] Press any key in the result window to exit.")
    cv2.waitKey(0)
    cv2.destroyAllWindows()


# ══════════════════════════════════════════════════════════════════════════════
# Entry point
# ══════════════════════════════════════════════════════════════════════════════

def main() -> None:
    parser = argparse.ArgumentParser(
        description="CheckIt — compare a reference ID photo against a live webcam face"
    )
    parser.add_argument(
        "reference_image",
        help="Path to the reference / ID photo (JPEG or PNG)"
    )
    parser.add_argument(
        "--camera", type=int, default=0,
        help="Webcam device index (default: 0)"
    )
    parser.add_argument(
        "--model", default="Facenet512",
        choices=["Facenet512", "ArcFace", "VGG-Face", "Facenet"],
        help="DeepFace embedding model (default: Facenet512)"
    )
    parser.add_argument(
        "--threshold", type=float, default=MATCH_THRESHOLD,
        help=f"Cosine distance match threshold (default: {MATCH_THRESHOLD})"
    )
    parser.add_argument(
        "--no-liveness", action="store_true",
        help="Skip the blink liveness check (for debugging)"
    )
    parser.add_argument(
        "--no-display", action="store_true",
        help="Skip the side-by-side comparison window"
    )
    args = parser.parse_args()

    # ── Validate reference image ───────────────────────────────────────────────
    if not os.path.isfile(args.reference_image):
        print(f"[ERROR] File not found: {args.reference_image}")
        sys.exit(1)

    ref_bgr = cv2.imread(args.reference_image)
    if ref_bgr is None:
        print(f"[ERROR] Could not read image: {args.reference_image}")
        sys.exit(1)
    print(f"[INFO] Reference image loaded  ({ref_bgr.shape[1]}×{ref_bgr.shape[0]})")

    # ── Step 1: detect & align reference face ─────────────────────────────────
    print("[INFO] Detecting face in reference image…")
    try:
        ref_face = detect_and_align_face(
            ref_bgr,
            label="reference image",
            min_confidence=0.30,   # lower threshold for printed / scanned photos
        )
    except ValueError as exc:
        print(f"[ERROR] {exc}")
        sys.exit(1)

    if ref_face is None:
        sys.exit(1)
    print("[INFO] Reference face crop ready  (224×224)")

    # ── Step 2: extract reference embedding ───────────────────────────────────
    print(f"[INFO] Extracting reference embedding  (model: {args.model})…")
    ref_emb = get_embedding(ref_face, label="reference", model_name=args.model)
    if ref_emb is None:
        sys.exit(1)
    print(f"[INFO] Reference embedding ready  (dim={ref_emb.shape[0]})")

    # ── Step 3: capture live image ─────────────────────────────────────────────
    print("[INFO] Opening webcam…")
    live_frame = capture_live_image(
        camera_index=args.camera,
        skip_liveness=args.no_liveness,
    )
    if live_frame is None:
        print("[ERROR] No live frame was captured.")
        sys.exit(1)

    cv2.imwrite(DEBUG_SAVE_PATH, live_frame)
    print(f"[INFO] Live frame saved → {DEBUG_SAVE_PATH}")

    # ── Step 4: detect & align live face ──────────────────────────────────────
    print("[INFO] Detecting face in live capture…")
    try:
        live_face = detect_and_align_face(live_frame, label="live capture")
    except ValueError as exc:
        print(f"[ERROR] {exc}")
        sys.exit(1)

    if live_face is None:
        sys.exit(1)

    # ── Step 5: extract live embedding ────────────────────────────────────────
    print(f"[INFO] Extracting live embedding  (model: {args.model})…")
    live_emb = get_embedding(live_face, label="live", model_name=args.model)
    if live_emb is None:
        sys.exit(1)

    # ── Step 6 & 7: compare + output ──────────────────────────────────────────
    distance, is_match = compare_faces(ref_emb, live_emb, threshold=args.threshold)
    similarity_pct = max(0.0, (1.0 - distance) * 100.0)

    _print_result(distance, is_match, args.threshold)

    if not args.no_display:
        _show_comparison(ref_face, live_face, is_match, similarity_pct)


if __name__ == "__main__":
    main()
