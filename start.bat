@echo off
cd /d %~dp0
where node >nul 2>&1
if %errorlevel%==0 (
  node server.mjs
) else (
  echo Node.js was not found. Trying Python...
  python -m http.server 8787 --bind 0.0.0.0
)
pause
