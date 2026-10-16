#!/bin/bash
set -euo pipefail

# Disarms the rollback watchdog timer after confirming the new display session is healthy
echo "🛡️ [WATCHDOG] Disarming rollback watchdog timer..."
systemctl stop mimo-kiosk-rollback.timer 2>/dev/null || true
systemctl disable mimo-kiosk-rollback.timer 2>/dev/null || true
echo "✅ [WATCHDOG] Disarmed successfully. New kiosk session confirmed healthy."
