#!/bin/bash
set -e
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
rm -rf _c
"$CHROME" --headless --disable-gpu --no-sandbox --disable-dev-shm-usage --user-data-dir="$(pwd)/_c" --virtual-time-budget=25000 --dump-dom "http://localhost:8601/" > _home.html 2>_home_err.txt
echo "exit=$?"
echo "bytes=$(wc -c < _home.html)"
