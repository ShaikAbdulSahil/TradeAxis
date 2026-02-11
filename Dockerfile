# --- STAGE 1: Build ---
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first for better caching
COPY package*.json ./
COPY prisma ./prisma/
RUN npm install

# Copy source and build the app
COPY . .
RUN npx prisma generate
RUN npm run build

# --- STAGE 2: Production ---
FROM node:20-alpine AS runner

WORKDIR /app

# Only copy essential production files from the builder stage
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Set to production mode
ENV NODE_ENV=production

EXPOSE 3000

# Using node directly for maximum performance
CMD ["node", "dist/main"]