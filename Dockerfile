FROM node:20-bullseye-slim

# Tools needed to compile native modules (better-sqlite3, onnxruntime-node)
RUN apt-get update && apt-get install -y python3 make g++ unzip && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies (cached layer — only re-runs if package.json changes)
COPY package*.json ./
RUN npm ci

# Generate Prisma client
COPY prisma ./prisma/
COPY prisma.config.ts ./
RUN npx prisma generate

# Copy source
COPY . .

# Download ArcFace models (~90 MB — runs once during build)
RUN node download-arcface.mjs

# Build Next.js
RUN npm run build

EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production

# Run migrations then start
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
