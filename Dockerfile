# ============================================================
# Multi-stage Dockerfile for Engine NVH & Mount Dynamics App
# Packages: React Vite UI + Node.js Express API + Python Solver
# ============================================================

# --- Stage 1: Build Frontend Assets ---
FROM node:20-slim AS frontend-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# --- Stage 2: Production Server with Python 3 & Node.js ---
FROM node:20-bookworm-slim
WORKDIR /app

# Install Python 3, pip, venv
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Set up dedicated Python virtual environment
ENV VIRTUAL_ENV=/opt/venv
RUN python3 -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# Install scientific dependencies (NumPy, SciPy, Matplotlib)
COPY python/requirements.txt ./python/
RUN pip install --no-cache-dir -r python/requirements.txt

# Install backend dependencies
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --only=production

# Copy backend source
COPY server/ ./

# Copy python calculations
COPY python/ /app/python/

# Copy built frontend assets from stage 1
COPY --from=frontend-builder /app/client/dist /app/client/dist

# Default environment configuration
ENV PORT=5050
ENV NODE_ENV=production
ENV PYTHON_PATH=/opt/venv/bin/python3
ENV CLIENT_URL=""

EXPOSE 5050

CMD ["node", "index.js"]
