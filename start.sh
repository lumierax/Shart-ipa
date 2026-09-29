#!/usr/bin/env sh
cd "$(dirname "$0")"
if command -v node >/dev/null 2>&1; then
  exec node server.mjs
elif command -v python3 >/dev/null 2>&1; then
  exec python3 -m http.server 8787 --bind 0.0.0.0
else
  echo "Install Node.js or Python to serve the static files locally."
  exit 1
fi
