#!/bin/bash
set -e
export DEBIAN_FRONTEND=noninteractive

echo "Updating system..."
apt-get update

echo "Installing CUPS, Brother drivers, Python, and LibreOffice..."
apt-get install -y cups printer-driver-brlaser python3-pip python3-venv libreoffice

echo "Adding user to lpadmin..."
usermod -a -G lpadmin pi

echo "Configuring CUPS to allow remote access (optional but helpful)..."
cupsctl --remote-any

echo "Checking for attached Brother printer and adding it to CUPS..."
# Attempt to find the USB URI of the Brother printer
USB_URI=$(lpinfo -v | grep usb | grep -i brother | awk '{print $2}' | head -n 1)

if [ -z "$USB_URI" ]; then
    echo "WARNING: Could not detect Brother printer via USB. You may need to add it manually."
else
    echo "Found Brother printer at $USB_URI"
    # Create the printer queue named Brother_HL_L2440DW_series using brlaser driver
    lpadmin -p Brother_HL_L2440DW_series -E -v "$USB_URI" -m drv:///brlaser.drv/brl2360d.ppd
    lpoptions -d Brother_HL_L2440DW_series
    echo "Printer added and set as default!"
fi

echo "Setting up Python environment..."
mkdir -p /home/pi/mimo
cd /home/pi/mimo
# Use system packages for pip or create venv (Debian 12+ requires venv)
python3 -m venv venv
./venv/bin/pip install firebase-admin requests

echo "Setup script completed successfully."
