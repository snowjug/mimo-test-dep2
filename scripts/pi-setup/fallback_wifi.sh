#!/bin/bash
# fallback_wifi.sh
# This script checks for internet connectivity. If none is found, it connects to a fallback WiFi.

TARGET="8.8.8.8"
FALLBACK_SSID="Print-Mimo"
FALLBACK_PASS="1234567890"

# Ping Google's DNS to check for active internet
if ! ping -q -c 3 -W 3 $TARGET > /dev/null 2>&1; then
    echo "$(date): No internet connection detected. Attempting fallback..."
    
    # Check if the connection profile exists in NetworkManager
    if ! nmcli con show "$FALLBACK_SSID" > /dev/null 2>&1; then
        echo "$(date): Creating NetworkManager profile for $FALLBACK_SSID..."
        sudo nmcli con add type wifi ifname wlan0 con-name "$FALLBACK_SSID" ssid "$FALLBACK_SSID" wifi-sec.key-mgmt wpa-psk wifi-sec.psk "$FALLBACK_PASS" connection.autoconnect-priority -10
    fi
    
    # Try bringing up the fallback connection
    sudo nmcli con up "$FALLBACK_SSID"
else
    # echo "$(date): Internet is active."
    exit 0
fi
