@echo off
echo.
echo  HelpDesk OS - Compilando agente de inventario...
echo  ================================================
echo.

where go >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERROR: Go no esta instalado.
    echo  Descargalo en https://go.dev/dl/ e instala el .msi
    echo.
    pause
    exit /b 1
)

echo  Descargando dependencias...
go mod tidy

echo  Compilando para Windows x64...
set GOOS=windows
set GOARCH=amd64
go build -ldflags="-s -w -H windowsgui" -o helpdesk-agent.exe .

if %errorlevel% neq 0 (
    echo.
    echo  ERROR: La compilacion fallo. Revisa los mensajes de arriba.
    pause
    exit /b 1
)

echo.
echo  OK  helpdesk-agent.exe compilado correctamente
echo.

REM Copiar al directorio public de la web app
if exist "..\web\public\" (
    copy /Y helpdesk-agent.exe ..\web\public\helpdesk-agent.exe >nul
    echo  OK  Copiado a apps\web\public\helpdesk-agent.exe
) else (
    mkdir ..\web\public 2>nul
    copy /Y helpdesk-agent.exe ..\web\public\helpdesk-agent.exe >nul
    echo  OK  Copiado a apps\web\public\helpdesk-agent.exe
)

echo.
echo  Listo. El agente esta disponible para descarga desde HelpDesk OS.
echo.
pause
