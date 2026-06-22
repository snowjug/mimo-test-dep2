# ADB Commands Reference — KioskLauncher

## Setup

### Check connected devices
```
.\adb devices
```

### Navigate to platform-tools folder
```
cd C:\Users\<your-name>\Downloads\platform-tools-latest-windows\platform-tools
```

---

## Installing the App

### Install the KioskLauncher APK
```
.\adb install -r "path\to\app-debug.apk"
```

### Install Kiosk Browser APK
```
.\adb install "path\to\kioskbrowser.apk"
```

### Install on a specific device (when multiple devices connected)
```
.\adb -s "your-device-id" install "path\to\app-debug.apk"
```

---

## Device Owner

### Set Device Owner (required for Lock Task Mode)
```
.\adb shell dpm set-device-owner com.kiosklauncher/.KioskDeviceAdminReceiver
```

### Set Device Owner on a specific device
```
.\adb -s "your-device-id" shell dpm set-device-owner com.kiosklauncher/.KioskDeviceAdminReceiver
```

### Remove Device Owner (to exit kiosk mode)
```
.\adb shell dpm remove-active-admin com.kiosklauncher/.KioskDeviceAdminReceiver
```

---

## Package Management

### Find Kiosk Browser package name
```
.\adb shell pm list packages | findstr kiosk
```

### Find package name on a specific device
```
.\adb -s "your-device-id" shell pm list packages | findstr kiosk
```

### List all installed packages
```
.\adb shell pm list packages
```

### Set default home/launcher app
```
.\adb shell cmd package set-home-activity com.kiosklauncher/.KioskLauncherActivity
```

---

## Device Control

### Reboot device
```
.\adb reboot
```

### Reboot specific device
```
.\adb -s "your-device-id" reboot
```

---

## Troubleshooting

### Clear Google accounts (if Device Owner setup is blocked)
```
.\adb shell pm clear com.google.android.gms
```

### Check if Device Owner is set
```
.\adb shell dpm list-owners
```
## to kill the previously running app
.\adb shell am force-stop com.kiosklauncher
---

## Notes
- Use `.\adb` in PowerShell, use `adb` in Command Prompt
- If multiple devices are connected, always use `.\adb -s "device-id"` to target the right one
- Device Owner cannot be set if Google accounts are present on the device
- Device Owner requires a factory-reset or unenrolled device for first-time setup

## streamlined installation
adb shell am force-stop com.kiosklauncher | adb install -r "C:\Users\Nitin Kumar\Desktop\WORKS\MIMO_WORKS\KioskLauncher\KioskLauncher\KioskLauncher\app\build\outputs\apk\debug\app-debug.apk"