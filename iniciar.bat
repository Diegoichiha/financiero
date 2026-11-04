@echo off
rem Inicia el servidor local de Hogy Financiero y abre el navegador.
cd /d "%~dp0"
title Hogy Financiero - servidor local
start "" "http://localhost:5210"
node server.js
pause
