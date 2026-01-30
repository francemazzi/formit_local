#!/bin/bash

# Script per avviare Formit con Docker
# Verifica e installa Docker se necessario

set -e

# Colori per output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Formit Startup Script ===${NC}"

# Funzione per verificare se un comando esiste
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Verifica se Docker è installato
check_docker() {
    if command_exists docker && docker --version >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Docker è già installato${NC}"
        docker --version
        return 0
    else
        echo -e "${YELLOW}⚠ Docker non è installato${NC}"
        return 1
    fi
}

# Verifica se Docker Compose è installato
check_docker_compose() {
    if docker compose version >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Docker Compose è disponibile${NC}"
        docker compose version
        return 0
    else
        echo -e "${YELLOW}⚠ Docker Compose non è disponibile${NC}"
        return 1
    fi
}

# Installa Docker su macOS
install_docker_mac() {
    echo -e "${YELLOW}Installazione di Docker su macOS...${NC}"
    
    if command_exists brew; then
        echo -e "${GREEN}Utilizzo Homebrew per installare Docker Desktop...${NC}"
        brew install --cask docker
        echo -e "${YELLOW}Docker Desktop è stato installato.${NC}"
        echo -e "${YELLOW}Per favore, avvia Docker Desktop dall'Applicazioni e riprova.${NC}"
        exit 1
    else
        echo -e "${RED}Homebrew non è installato.${NC}"
        echo -e "${YELLOW}Installa Docker Desktop manualmente da: https://www.docker.com/products/docker-desktop${NC}"
        exit 1
    fi
}

# Installa Docker su Linux
install_docker_linux() {
    echo -e "${YELLOW}Installazione di Docker su Linux...${NC}"
    
    # Rileva la distribuzione
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
    else
        echo -e "${RED}Impossibile rilevare la distribuzione Linux.${NC}"
        exit 1
    fi
    
    # Richiede privilegi root
    if [ "$EUID" -ne 0 ]; then
        echo -e "${YELLOW}Richiesti privilegi sudo per installare Docker...${NC}"
        SUDO="sudo"
    else
        SUDO=""
    fi
    
    case $OS in
        ubuntu|debian)
            echo -e "${GREEN}Installazione Docker per Ubuntu/Debian...${NC}"
            $SUDO apt-get update
            $SUDO apt-get install -y ca-certificates curl gnupg lsb-release
            $SUDO install -m 0755 -d /etc/apt/keyrings
            curl -fsSL https://download.docker.com/linux/$ID/gpg | $SUDO gpg --dearmor -o /etc/apt/keyrings/docker.gpg
            $SUDO chmod a+r /etc/apt/keyrings/docker.gpg
            echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$ID $(lsb_release -cs) stable" | $SUDO tee /etc/apt/sources.list.d/docker.list > /dev/null
            $SUDO apt-get update
            $SUDO apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
            ;;
        fedora|rhel|centos)
            echo -e "${GREEN}Installazione Docker per Fedora/RHEL/CentOS...${NC}"
            $SUDO dnf install -y dnf-plugins-core
            $SUDO dnf config-manager --add-repo https://download.docker.com/linux/$ID/docker-ce.repo
            $SUDO dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
            $SUDO systemctl start docker
            $SUDO systemctl enable docker
            ;;
        arch|manjaro)
            echo -e "${GREEN}Installazione Docker per Arch Linux...${NC}"
            $SUDO pacman -S --noconfirm docker docker-compose
            $SUDO systemctl start docker
            $SUDO systemctl enable docker
            ;;
        *)
            echo -e "${RED}Distribuzione Linux non supportata automaticamente.${NC}"
            echo -e "${YELLOW}Installa Docker manualmente seguendo la documentazione: https://docs.docker.com/get-docker/${NC}"
            exit 1
            ;;
    esac
    
    # Aggiungi l'utente corrente al gruppo docker (se non è root)
    if [ "$EUID" -ne 0 ]; then
        $SUDO usermod -aG docker $USER
        echo -e "${YELLOW}⚠ Devi fare logout e login per usare Docker senza sudo${NC}"
        echo -e "${YELLOW}Oppure esegui questo script con sudo${NC}"
    fi
    
    echo -e "${GREEN}✓ Docker installato con successo${NC}"
}

# Installa Docker
install_docker() {
    OS="$(uname -s)"
    case "${OS}" in
        Linux*)
            install_docker_linux
            ;;
        Darwin*)
            install_docker_mac
            ;;
        *)
            echo -e "${RED}Sistema operativo non supportato: ${OS}${NC}"
            exit 1
            ;;
    esac
}

# Verifica e installa Docker se necessario
if ! check_docker; then
    install_docker
    echo -e "${YELLOW}Dopo l'installazione, riavvia questo script.${NC}"
    exit 0
fi

# Verifica Docker Compose
if ! check_docker_compose; then
    echo -e "${RED}Docker Compose non è disponibile.${NC}"
    echo -e "${YELLOW}Assicurati di avere Docker Desktop (macOS/Windows) o docker-compose-plugin (Linux) installato.${NC}"
    exit 1
fi

# Verifica che Docker sia in esecuzione
if ! docker info >/dev/null 2>&1; then
    echo -e "${RED}Docker non è in esecuzione.${NC}"
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

echo -e "${GREEN}✓ Docker è in esecuzione${NC}"

# Verifica aggiornamenti da GitHub
check_for_updates() {
    echo -e "${YELLOW}Controllo aggiornamenti da GitHub...${NC}"

    # Fetch latest from remote
    git fetch origin main --quiet 2>/dev/null || {
        echo -e "${YELLOW}⚠ Impossibile contattare GitHub, continuo con versione locale${NC}"
        return 1
    }

    # Get local and remote commit hashes
    LOCAL_HASH=$(git rev-parse HEAD 2>/dev/null)
    REMOTE_HASH=$(git rev-parse origin/main 2>/dev/null)

    if [ -z "$LOCAL_HASH" ] || [ -z "$REMOTE_HASH" ]; then
        echo -e "${YELLOW}⚠ Impossibile verificare versione, continuo...${NC}"
        return 1
    fi

    if [ "$LOCAL_HASH" != "$REMOTE_HASH" ]; then
        echo -e "${YELLOW}⚠ Nuova versione disponibile!${NC}"
        echo -e "${YELLOW}  Locale:  ${LOCAL_HASH:0:7}${NC}"
        echo -e "${YELLOW}  Remoto:  ${REMOTE_HASH:0:7}${NC}"
        return 0  # Update available
    else
        echo -e "${GREEN}✓ Già all'ultima versione (${LOCAL_HASH:0:7})${NC}"
        return 1  # No update needed
    fi
}

# Funzione per applicare aggiornamenti
apply_updates() {
    echo -e "${YELLOW}[1/4] Arresto del servizio in corso...${NC}"
    docker compose down 2>/dev/null || echo -e "${YELLOW}Nessun servizio attivo${NC}"

    echo -e "${YELLOW}[2/4] Passaggio al branch main...${NC}"
    git checkout main

    echo -e "${YELLOW}[3/4] Applicazione aggiornamenti...${NC}"
    git reset --hard origin/main

    echo -e "${GREEN}✓ Aggiornamento completato${NC}"
    echo -e "${GREEN}Ultimo commit:${NC}"
    git log -1 --oneline
}

# Controlla e applica aggiornamenti se disponibili
if check_for_updates; then
    echo
    apply_updates
    echo
fi

# Avvia il progetto
echo -e "${YELLOW}[4/4] Avvio di Formit con Docker Compose...${NC}"
docker compose up -d --build

echo -e "${GREEN}✓ Formit avviato con successo!${NC}"
echo -e "${GREEN}Il servizio è disponibile su http://localhost:3007${NC}"
echo -e "${YELLOW}Per vedere i log: docker compose logs -f formit-mcp${NC}"
echo -e "${YELLOW}Per fermare: docker compose down${NC}"

