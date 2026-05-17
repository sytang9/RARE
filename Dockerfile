FROM node:20-slim

# better-sqlite3 is a native module — needs Python + C++ build tools
RUN apt-get update && \
    apt-get install -y python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps (native modules compile here with the tools above)
COPY package*.json ./
RUN npm ci

# Copy source and build frontend
COPY . .
RUN npm run build:web

EXPOSE 3100

CMD ["node", "--import", "tsx/esm", "--import", "./scripts/raw-loader.mjs", "server.ts"]
