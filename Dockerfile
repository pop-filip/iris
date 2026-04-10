FROM node:20-alpine

WORKDIR /app

# Install dependencies first (layer cache)
COPY package.json package-lock.json* ./
RUN npm ci --only=production

# Copy application source (node_modules and .env excluded via .dockerignore)
COPY . .

EXPOSE 3002

CMD ["node", "chat-server.js"]
