#!/bin/bash
set -euo pipefail

# Automated rollback script executed if the watchdog timer fires without disarm.
# Restores LightDM / labwc desktop session and stops Cage service.

echo "🚨 [ROLLBACK] Watchdog timer expired without confirmation! Initiating automatic recovery..."

# 1. Stop and disable experimental Cage kiosk service
systemctl stop mimo-kiosk.service 2>/dev/null || true
systemctl disable mimo-kiosk.service 2>/dev/null || true

# 2. Re-enable and restart proven LightDM session
systemctl unmask lightdm.service 2>/dev/null || true
systemctl enable lightdm.service
systemctl restart lightdm.service

echo "✅ [ROLLBACK] LightDM restored successfully. Display session recovered."
