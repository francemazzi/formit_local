#!/bin/bash

# Script per aggiornare Formit all'ultimo commit del branch main e riavviare
# Repository: https://github.com/francemazzi/formit_local

set -e

# Colori per output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Formit Update Script ===${NC}"
echo

# Verifica se git e' installato
if ! command -v git &> /dev/null; then
    echo -e "${RED}Git non e' installato. Installa Git e riprova.${NC}"
    exit 1
fi

# Verifica se Docker e' in esecuzione
if ! docker info &> /dev/null; then
    echo -e "${RED}Docker non e' in esecuzione.${NC}"
    OS="$(uname -s)"
    case "${OS}" in
        Darwin*)
            echo -e "${YELLOW}Avvia Docker Desktop dall'Applicazioni.${NC}"
            ;;
        Linux*)
            echo -e "${YELLOW}Avvia Docker con: sudo systemctl start docker${NC}"
            ;;
    esac
    exit 1
fi

echo -e "${YELLOW}[1/5] Arresto del servizio in corso...${NC}"
docker compose down || echo -e "${YELLOW}Nessun servizio attivo da fermare, continuo...${NC}"

echo
echo -e "${YELLOW}[2/5] Passaggio al branch main...${NC}"
git checkout main

echo
echo -e "${YELLOW}[3/5] Download degli aggiornamenti da GitHub...${NC}"
git fetch origin main

echo
echo -e "${YELLOW}[4/5] Applicazione degli aggiornamenti...${NC}"
git reset --hard origin/main

echo
echo -e "${YELLOW}[5/5] Riavvio del servizio con rebuild...${NC}"
docker compose up -d --build

echo
echo -e "${GREEN}========================================"
echo -e "  Formit aggiornato e riavviato!"
echo -e "  Il servizio e' disponibile su:"
echo -e "  http://localhost:3007"
echo -e "========================================${NC}"
echo
echo -e "${GREEN}Ultimo commit:${NC}"
git log -1 --oneline
echo
echo -e "${YELLOW}Per vedere i log: docker compose logs -f formit-mcp${NC}"
