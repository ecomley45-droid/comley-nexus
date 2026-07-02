@echo off
cd /d "%~dp0"

echo Starting CMS dev server...
start "CMS Dev Server" cmd /k npm run dev

echo Waiting for server to start...
timeout /t 5 /nobreak >nul

echo Opening Chrome...
start chrome http://localhost:5173/
