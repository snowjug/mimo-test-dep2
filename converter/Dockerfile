FROM node:20-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

# Install LibreOffice, Writer module, required fonts, and certificates
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       libreoffice \
       libreoffice-writer \
       fonts-dejavu-core \
       fonts-liberation \
       ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev

COPY index.js ./

# Cloud Run injects the PORT environment variable (default 8080)
ENV PORT=8080
EXPOSE 8080

CMD ["node", "index.js"]
