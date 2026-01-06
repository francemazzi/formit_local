#!/bin/bash
# Setup script per Formit MCP su Raspberry Pi con Docker

set -e

echo "🍓 Formit MCP - Raspberry Pi Setup"
echo "==================================="

# Colori
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Verifica Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker non trovato. Installalo con:${NC}"
    echo "curl -fsSL https://get.docker.com | sh"
    echo "sudo usermod -aG docker \$USER"
    exit 1
fi

echo -e "${GREEN}✅ Docker trovato${NC}"

# Verifica Docker Compose
if ! docker compose version &> /dev/null; then
    echo -e "${RED}❌ Docker Compose non trovato${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Docker Compose trovato${NC}"

# Crea file .env se non esiste
if [ ! -f .env ]; then
    echo -e "${YELLOW}📝 Creazione file .env...${NC}"
    cp .env.example .env
    echo -e "${YELLOW}⚠️  Modifica .env con le tue API keys:${NC}"
    echo "   nano .env"
fi

# Build immagine
echo -e "${YELLOW}🔨 Building Docker image (può richiedere tempo su RPi)...${NC}"
docker compose build

# Avvia container
echo -e "${YELLOW}🚀 Avvio container...${NC}"
docker compose up -d

# Verifica stato
echo ""
echo -e "${GREEN}✅ Formit MCP avviato!${NC}"
echo ""
echo "📊 Status:"
docker compose ps

echo ""
echo "🔗 Endpoints:"
echo "   Health:  http://localhost:3007/health"
echo "   SSE:     http://localhost:3007/sse"

echo ""
echo "📋 Comandi utili:"
echo "   docker compose logs -f        # Vedi logs"
echo "   docker compose restart        # Riavvia"
echo "   docker compose down           # Ferma"
echo "   docker compose up -d --build  # Rebuild e riavvia"

echo ""
echo "🌐 Per esporre su internet con Tailscale Funnel:"
echo "   tailscale funnel 3007"

