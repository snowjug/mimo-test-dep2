#!/bin/bash
set -euo pipefail

# Kiosk browser launcher for Cage Wayland compositor on SV-002
# Configures Leoxsys touchscreen display output and executes Chromium in kiosk mode

# Map physical Leoxsys display (HDMI-A-2) and turn off unused port
if command -v wlr-randr >/dev/null 2>&1; then
    wlr-randr --output HDMI-A-1 --off --output HDMI-A-2 --pos 0,0 --mode 1920x1080 2>/dev/null || true
fi

# Launch Chromium fullscreen kiosk
exec /usr/bin/chromium \
    --kiosk \
    --noerrdialogs \
    --disable-infobars \
    --no-first-run \
    --ozone-platform=wayland \
    --password-store=basic \
    --autoplay-policy=no-user-gesture-required \
    --disk-cache-size=1 \
    --enable-gpu-rasterization \
    "https://mimo-2-0.vercel.app/?kioskId=SV-002"
