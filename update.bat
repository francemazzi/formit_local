@echo off
setlocal enabledelayedexpansion

REM Script per aggiornare Formit all'ultimo commit del branch main e riavviare
REM Repository: https://github.com/francemazzi/formit_local

echo === Formit Update Script ===
echo.

REM Verifica se git e' installato
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Git non e' installato. Installa Git e riprova.
    pause
    exit /b 1
)

REM Verifica se Docker e' in esecuzione
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo Docker non e' in esecuzione.
    echo Avvia Docker Desktop e riprova.
    pause
    exit /b 1
)

REM Verifica aggiornamenti da GitHub
echo Controllo aggiornamenti da GitHub...
git fetch origin main >nul 2>&1
if %errorlevel% neq 0 (
    echo Impossibile contattare GitHub, procedo comunque...
    goto do_update
)

REM Get local and remote commit hashes
for /f "tokens=*" %%i in ('git rev-parse HEAD 2^>nul') do set LOCAL_HASH=%%i
for /f "tokens=*" %%i in ('git rev-parse origin/main 2^>nul') do set REMOTE_HASH=%%i

if "%LOCAL_HASH%"=="" goto do_update
if "%REMOTE_HASH%"=="" goto do_update

if "%LOCAL_HASH%"=="%REMOTE_HASH%" (
    echo.
    echo ========================================
    echo   Gia' all'ultima versione!
    echo   Commit: %LOCAL_HASH:~0,7%
    echo ========================================
    echo.
    set /p RESTART_ANYWAY="Vuoi riavviare comunque il servizio? (s/n): "
    if /i "!RESTART_ANYWAY!"=="s" (
        echo Riavvio del servizio...
        docker compose down >nul 2>&1
        docker compose up -d --build
        echo Servizio riavviato.
        pause
        exit /b 0
    )
    echo Nessun aggiornamento necessario.
    pause
    exit /b 0
)

echo.
echo ========================================
echo   Nuova versione disponibile!
echo   Locale:  %LOCAL_HASH:~0,7%
echo   Remoto:  %REMOTE_HASH:~0,7%
echo ========================================
echo.

:do_update
echo [1/5] Arresto del servizio in corso...
docker compose down
if %errorlevel% neq 0 (
    echo Nessun servizio attivo da fermare, continuo...
)

echo.
echo [2/5] Passaggio al branch main...
git checkout main
if %errorlevel% neq 0 (
    echo Errore durante il checkout del branch main.
    pause
    exit /b 1
)

echo.
echo [3/5] Download degli aggiornamenti da GitHub...
git fetch origin main
if %errorlevel% neq 0 (
    echo Errore durante il fetch da origin.
    pause
    exit /b 1
)

echo.
echo [4/5] Applicazione degli aggiornamenti...
git reset --hard origin/main
if %errorlevel% neq 0 (
    echo Errore durante il reset al branch remoto.
    pause
    exit /b 1
)

echo.
echo [5/5] Riavvio del servizio con rebuild...
docker compose up -d --build

if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo   Formit aggiornato e riavviato!
    echo   Il servizio e' disponibile su:
    echo   http://localhost:3007
    echo ========================================
    echo.
    echo Ultimo commit:
    git log -1 --oneline
    echo.
) else (
    echo.
    echo Errore durante il riavvio di Formit.
    echo Controlla i log con: docker compose logs
    pause
    exit /b 1
)

pause
