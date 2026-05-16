FROM node:20-slim

WORKDIR /app

# Copy package files and install deps
COPY package*.json ./
RUN npm ci

# Rebuild native modules for this container's Node version
RUN npm rebuild better-sqlite3

# Copy source
COPY . .

# Build the Vite frontend
RUN npm run build:web

EXPOSE 3000

CMD ["node", "--import", "tsx/esm", "--import", "./scripts/raw-loader.mjs", "server.ts"]
