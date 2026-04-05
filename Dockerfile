FROM node:20-bullseye-slim

# System deps: native modules (better-sqlite3, onnxruntime) + Python for PaddleOCR
RUN apt-get update && apt-get install -y \
    python3 python3-pip make g++ unzip \
    libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Install PaddleOCR (Python) — headless OpenCV avoids pulling in X11/GL deps
# paddlepaddle is the CPU-only deep learning runtime
RUN pip3 install --no-cache-dir \
    opencv-python-headless \
    paddlepaddle \
    paddleocr

WORKDIR /app

# Install Node.js dependencies (cached layer — only re-runs if package.json changes)
COPY package*.json ./
RUN npm ci

# Generate Prisma client
COPY prisma ./prisma/
COPY prisma.config.ts ./
RUN npx prisma generate

# Copy source
COPY . .

# Download ArcFace models (~90 MB)
RUN node download-arcface.mjs

# Pre-download PaddleOCR English models during build so the first scan is instant
RUN python3 -c "\
import numpy as np; \
from paddleocr import PaddleOCR; \
ocr = PaddleOCR(use_angle_cls=True, lang='en', use_gpu=False, show_log=False); \
ocr.ocr(np.zeros((100, 400, 3), dtype=np.uint8), cls=True); \
print('PaddleOCR models ready') \
"

# Build Next.js
RUN npm run build

EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production

CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
