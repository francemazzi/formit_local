# Dockerfile per Frontend React/Vite
FROM node:20-slim AS builder

WORKDIR /app

# Copia package files
COPY package*.json ./

# Installa dipendenze
RUN npm ci

# Copia sorgenti
COPY . .

# Build dell'applicazione
RUN npm run build

# ============================================
# Production stage
# ============================================
FROM nginx:alpine AS production

# Copia i file buildati
COPY --from=builder /app/dist /usr/share/nginx/html

# Copia configurazione nginx personalizzata
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Espone porta 80
EXPOSE 80

# Avvia nginx
CMD ["nginx", "-g", "daemon off;"]

