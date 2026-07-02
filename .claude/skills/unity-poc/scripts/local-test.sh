#!/usr/bin/env bash
# Local pre-deploy smoke test of a Unity WebGL build:
#   1. serve the build on a local static server (clears any stale server on the port)
#   2. assert index/loader/wasm/data all return 200
#   3. load it in headless Chrome, inspect the PAGE console only, fail on JS exceptions
# Reliable parts (HTTP 200, no JS exceptions) gate the deploy; WebGL render is best-effort
# (headless GL can falsely fail) and only warns. Screenshot saved for human eyeball.
# Usage: local-test.sh <webglBuildDir> [port]
set -uo pipefail

DIR="${1:?webgl build dir required}"
PORT="${2:-8123}"
HERE="$(cd "$(dirname "$0")" && pwd)"
[ -f "$DIR/index.html" ] || { echo "no index.html in $DIR"; exit 1; }
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
URL="http://localhost:$PORT"
SHOT="$DIR/_localtest.png"
CLOG="$DIR/_localtest.console.log"

# clear stale server on this port, then serve fresh
pkill -f "http.server $PORT" 2>/dev/null
sleep 0.5
echo "serving $DIR on $URL"
( cd "$DIR" && exec python3 -m http.server "$PORT" >/dev/null 2>&1 ) &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
sleep 1.5

fail=0
for path in "/" "/Build/WebGL.loader.js" "/Build/WebGL.wasm" "/Build/WebGL.data"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$URL$path")
  echo "  $path -> $code"
  [ "$code" = "200" ] || fail=1
done
[ $fail -eq 0 ] && echo "[PASS] all assets 200" || echo "[FAIL] missing assets"

# Preferred: real-time puppeteer-core run (waits for Unity to actually boot, catches
# boot-time faults like stripped classes). Falls back to single-shot headless Chrome.
if [ -x "$CHROME" ] && [ -f "$HERE/browser-test.mjs" ] && [ -d "$HERE/node_modules/puppeteer-core" ]; then
  echo "loading in Chrome via puppeteer-core (real-time boot, 18s)..."
  if node "$HERE/browser-test.mjs" "$URL" "$SHOT" 18000; then
    echo "[PASS] browser boot clean"
  else
    echo "[FAIL] browser boot reported fatal errors"; fail=1
  fi
elif [ -x "$CHROME" ]; then
  echo "loading in headless Chrome (20s virtual time)..."
  "$CHROME" --headless=new --no-sandbox --mute-audio \
    --enable-logging=stderr --v=1 \
    --ignore-gpu-blocklist --enable-unsafe-swiftshader --use-gl=angle --use-angle=swiftshader \
    --virtual-time-budget=20000 --window-size=1280,720 \
    --screenshot="$SHOT" "$URL" >/dev/null 2>"$CLOG"

  # Isolate PAGE console lines (Chrome tags them ":CONSOLE("); ignore browser internals.
  PAGE_CONSOLE=$(grep -aE ":CONSOLE\(" "$CLOG" || true)
  if [ -n "$PAGE_CONSOLE" ]; then echo "--- page console ---"; echo "$PAGE_CONSOLE" | sed -E 's/^.*CONSOLE\([0-9]+\)\] //' | head -12; fi
  if echo "$PAGE_CONSOLE" | grep -iqE "uncaught|exception|abort\(|assertion failed|cannot |is not a function|failed to (load|fetch|compile)|could not produce class|stripped from the build|invalid internalformat"; then
    echo "[FAIL] page console reports a fatal error"
    fail=1
  else
    echo "[PASS] no fatal JS exceptions in page console"
  fi

  if [ -f "$SHOT" ]; then
    SZ=$(stat -f%z "$SHOT" 2>/dev/null || stat -c%s "$SHOT" 2>/dev/null)
    echo "screenshot: $SHOT (${SZ} bytes)"
    [ "${SZ:-0}" -gt 5000 ] || echo "[warn] screenshot small/blank — headless WebGL may not render (not a hard fail)"
  else
    echo "[warn] no screenshot (headless GL unavailable — not a hard fail)"
  fi
else
  echo "[warn] Chrome not found — skipping browser load (HTTP checks still apply)"
fi

echo "local-test $([ $fail -eq 0 ] && echo PASS || echo FAIL)"
exit $fail
