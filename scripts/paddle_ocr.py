#!/usr/bin/env python3
"""
PaddleOCR text extractor.
Reads a base64-encoded JPEG image from stdin.
Prints a JSON object {"text": "...", "error": null} to stdout.
"""
import sys
import json
import base64
import tempfile
import os


def main():
    try:
        b64 = sys.stdin.read().strip()
        if not b64:
            raise ValueError("No image data received on stdin")

        img_bytes = base64.b64decode(b64)

        # Write to a temp file — PaddleOCR handles file paths most reliably
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
            f.write(img_bytes)
            tmp_path = f.name

        try:
            from paddleocr import PaddleOCR

            ocr = PaddleOCR(
                use_angle_cls=True,
                lang="en",
                use_gpu=False,
                show_log=False,
            )

            result = ocr.ocr(tmp_path, cls=True)

            lines = []
            if result and result[0]:
                for item in result[0]:
                    if item and len(item) >= 2:
                        text, confidence = item[1]
                        if confidence >= 0.4:          # drop very low-confidence noise
                            lines.append(text.strip())

            print(json.dumps({"text": "\n".join(lines), "error": None}))

        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    except Exception as exc:
        print(json.dumps({"text": "", "error": str(exc)}))


if __name__ == "__main__":
    main()
