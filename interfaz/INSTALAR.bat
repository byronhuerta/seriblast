@echo off
title Seriblast - Instalacion
color 0A
echo.
echo  ==========================================
echo   Seriblast - Instalador automatico
echo  ==========================================
echo.

:: Verificar Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
  color 0C
  echo  ERROR: Node.js no esta instalado.
  echo.
  echo  Descargalo en: https://nodejs.org
  echo  Instala la version LTS y vuelve a correr este archivo.
  echo.
  pause
  exit /b 1
)

echo  [1/2] Instalando dependencias...
call npm install
if %errorlevel% neq 0 (
  color 0C
  echo  ERROR al instalar dependencias.
  pause
  exit /b 1
)

echo.
echo  [2/2] Creando acceso directo en el escritorio...
set SHORTCUT=%USERPROFILE%\Desktop\Seriblast.bat
echo @echo off > "%SHORTCUT%"
echo title Seriblast Production >> "%SHORTCUT%"
echo cd /d "%~dp0" >> "%SHORTCUT%"
echo start http://localhost:3000 >> "%SHORTCUT%"
echo node server.js >> "%SHORTCUT%"

echo.
echo  ==========================================
echo   Instalacion completada!
echo  ==========================================
echo.
echo  Se creo "Seriblast" en tu escritorio.
echo  Haz doble clic en ese archivo para iniciar.
echo.
echo  O puedes iniciar ahora con INICIAR.bat
echo.
pause
