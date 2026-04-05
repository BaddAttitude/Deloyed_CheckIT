FROM node:20-bullseye-slim

# System deps: native modules (better-sqlite3, onnxruntime) + Python for PaddleOCR
RUN apt-get update && apt-get install -y \
    python3 python3-pip python3-dev make g++ unzip \
    libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip first
RUN pip3 install --upgrade pip setuptools wheel

# Install paddlepaddle CPU (large ~280 MB wheel — separate layer so Docker caches it)
RUN pip3 install --no-cache-dir "paddlepaddle==2.6.1"

# Install PaddleOCR + headless OpenCV (smaller, depends on paddle above)
RUN pip3 install --no-cache-dir opencv-python-headless "paddleocr==2.8.1"

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

# Build Next.js
RUN npm run build

EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production

CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
