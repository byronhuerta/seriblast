@echo off
title Seriblast - Sistema de Produccion
color 0A
echo.
echo  ==========================================
echo   Seriblast - Iniciando servidor...
echo  ==========================================
echo.
echo  Abre tu navegador en: http://localhost:3000
echo.
echo  Para acceder desde otros dispositivos en la red:
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4"') do (
  set IP=%%a
  set IP=%IP:~1%
  echo   http://%IP%:3000
)
echo.
echo  Presiona Ctrl+C para detener el servidor.
echo.
start http://localhost:3000
node server.js
pause
