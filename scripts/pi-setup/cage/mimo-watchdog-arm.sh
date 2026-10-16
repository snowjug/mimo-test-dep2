#!/bin/bash
set -euo pipefail

# Arms the persistent 180s rollback watchdog timer before initiating display cutover
echo "🛡️ [WATCHDOG] Arming 180-second rollback watchdog timer..."
systemctl stop mimo-kiosk-rollback.timer 2>/dev/null || true
systemctl start mimo-kiosk-rollback.timer

REMAINING=$(systemctl status mimo-kiosk-rollback.timer | grep -i "Trigger:" || true)
echo "✅ [WATCHDOG] Armed successfully. ${REMAINING}"
echo "⚠️ If not disarmed within 180s, the system will automatically revert to LightDM."
