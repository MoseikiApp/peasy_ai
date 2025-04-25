# Build stage
FROM node:18-alpine AS builder

# Install dependencies required for Prisma
RUN apk add --no-cache openssl libc6-compat

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./
# Copy Prisma schema
COPY prisma ./prisma/

# Install dependencies
RUN npm ci

# Copy the rest of the application code
COPY . .

COPY .env .env

COPY google.json google.json

# Build the Next.js app
RUN npm run build

# Runner stage
FROM node:18-alpine AS runner

# Install dependencies required for Prisma in runner stage too
RUN apk add --no-cache openssl libc6-compat

# Set working directory
WORKDIR /app

# Copy built assets from builder stage
COPY --from=builder /app/next.config.js ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/google.json ./google.json
COPY --from=builder /app/src ./src
COPY --from=builder /app/.env ./.env

# Expose port 3000
EXPOSE 3000

# Start the Next.js app
CMD ["npm", "run", "start"]