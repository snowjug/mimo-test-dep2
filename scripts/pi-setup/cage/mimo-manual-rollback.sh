#!/bin/bash
set -euo pipefail

# Instant manual recovery script to immediately restore the proven LightDM / labwc session
echo "🚨 [MANUAL ROLLBACK] Restoring original LightDM display session..."

systemctl stop mimo-kiosk-rollback.timer 2>/dev/null || true
systemctl disable mimo-kiosk-rollback.timer 2>/dev/null || true

systemctl stop mimo-kiosk.service 2>/dev/null || true
systemctl disable mimo-kiosk.service 2>/dev/null || true

systemctl unmask lightdm.service 2>/dev/null || true
systemctl enable lightdm.service
systemctl restart lightdm.service

echo "✅ [MANUAL ROLLBACK] LightDM restored and active."
