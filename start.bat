@echo off
setlocal enabledelayedexpansion

REM Script per avviare Formit con Docker su Windows
REM Verifica e installa Docker se necessario

echo === Formit Startup Script ===

REM Verifica se Docker è installato
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Docker non e' installato. Installazione in corso...
    goto install_docker
)

echo Docker e' gia' installato
docker --version

REM Verifica se Docker Compose è disponibile
docker compose version >nul 2>&1
if %errorlevel% neq 0 (
    echo Docker Compose non e' disponibile.
    echo Assicurati di avere Docker Desktop installato.
    pause
    exit /b 1
)

echo Docker Compose e' disponibile
docker compose version

REM Verifica che Docker sia in esecuzione
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo Docker non e' in esecuzione.
    echo Avvia Docker Desktop e riprova.
    pause
    exit /b 1
)

echo Docker e' in esecuzione
goto start_app

:install_docker
echo.
echo Installazione di Docker Desktop...

REM Verifica se winget è disponibile
where winget >nul 2>&1
if %errorlevel% equ 0 (
    echo Utilizzo winget per installare Docker Desktop...
    winget install --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements
    if %errorlevel% equ 0 (
        echo Docker Desktop installato con successo!
        echo Avvia Docker Desktop e riprova questo script.
        pause
        exit /b 0
    ) else (
        echo Installazione con winget fallita.
        goto manual_install
    )
) else (
    echo winget non e' disponibile.
    goto manual_install
)

:manual_install
echo.
echo Installazione automatica non disponibile.
echo.
echo Per installare Docker Desktop manualmente:
echo 1. Scarica Docker Desktop da: https://www.docker.com/products/docker-desktop
echo 2. Esegui il file di installazione
echo 3. Riavvia questo script dopo l'installazione
echo.
pause
exit /b 1

:start_app
echo.
echo Avvio di Formit con Docker Compose...
docker compose up -d --build

if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo   Formit avviato con successo!
    echo   Il servizio e' disponibile su:
    echo   http://localhost:3007
    echo ========================================
    echo.
    goto menu
) else (
    echo.
    echo Errore durante l'avvio di Formit.
    echo Controlla i log con: docker compose logs
    pause
    exit /b 1
)

:menu
echo.
echo === Menu Formit ===
echo [1] Visualizza i log in tempo reale
echo [2] Ferma il servizio
echo [3] Riavvia il servizio
echo [4] Esci (il servizio rimane attivo in background)
echo.
set /p choice="Scegli un'opzione (1-4): "

if "%choice%"=="1" (
    echo.
    echo Premi CTRL+C per tornare al menu...
    echo.
    docker compose logs -f formit-mcp
    goto menu
)
if "%choice%"=="2" (
    echo.
    echo Arresto del servizio...
    docker compose down
    echo Servizio arrestato.
    pause
    exit /b 0
)
if "%choice%"=="3" (
    echo.
    echo Riavvio del servizio...
    docker compose down
    docker compose up -d --build
    echo Servizio riavviato.
    goto menu
)
if "%choice%"=="4" (
    echo.
    echo Il servizio Formit continua a girare in background.
    echo Per fermarlo, esegui: docker compose down
    echo.
    timeout /t 3 >nul
    exit /b 0
)

echo.
echo Opzione non valida. Riprova.
goto menu

