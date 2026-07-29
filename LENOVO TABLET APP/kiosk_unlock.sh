#!/bin/bash

echo ""
echo "[1/3] Sending unlock signal to Kiosk app..."
adb shell am start -n com.example.revautsav/.MainActivity --es "action" "unlock"

echo ""
echo "[2/3] Resetting home screen to standard Lenovo launcher..."
adb shell cmd package set-home-activity com.tblenovo.launcher/com.tblenovo.launcher.TabUILauncher

echo ""
echo "[3/3] Stopping Kiosk app..."
adb shell am force-stop com.example.revautsav

if [ $? -eq 0 ]; then
    echo ""
    echo "🌟 SUCCESS: Tablet has been unlocked!"
else
    echo ""
    echo "❌ ERROR: Failed to unlock. Make sure your tablet is connected via USB and 'adb' is installed on your Mac."
fi
