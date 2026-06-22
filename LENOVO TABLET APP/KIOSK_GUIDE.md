# 🛡️ MIMO Self-Service Kiosk Controller Guide

This guide explains how to lock, unlock, and manage your tablet's strict Kiosk Mode from your computer. 

We have also created **clickable shortcut scripts** in this folder so you don't have to type commands in the terminal!

---

## ⚡ Clickable Shortcut Scripts
In the root folder of this project (`D:\Mimo\REVAUTSAV`), you will find the following batch scripts. Just double-click them to run:

1. **`kiosk_unlock.bat`** 🔓  
   * **What it does:** Sends a special `unlock` signal to the app to release the Android Lock Task protection, resets the home screen back to the standard Lenovo interface (`com.tblenovo.launcher`), and shuts down the app.
2. **`kiosk_lock.bat`** 🔒  
   * **What it does:** Sets the REVAUTSAV Kiosk app as the tablet's default home screen and launches it with a `lock` signal, securely locking it into Kiosk mode.
3. **`kiosk_remove_admin.bat`** 🚫  
   * **What it does:** Completely removes the Device Owner (administrator) status of the app. Run this if you need to uninstall the app or return the tablet to standard use.

---

## 💻 Manual Commands Reference
If you prefer running commands manually in PowerShell, use these exact commands:

### 1. Unlock the tablet (Send Unlock Intent, Restore Lenovo Launcher, and Stop App)
```powershell
# 1. Send unlock intent to release Lock Task Mode:
& "C:\Users\Rathindra\AppData\Local\Android\Sdk\platform-tools\adb.exe" shell am start -n com.example.revautsav/.MainActivity --es "action" "unlock"

# 2. Restore standard Lenovo tablet home launcher:
& "C:\Users\Rathindra\AppData\Local\Android\Sdk\platform-tools\adb.exe" shell cmd package set-home-activity com.tblenovo.launcher/com.tblenovo.launcher.TabUILauncher

# 3. Stop the kiosk app:
& "C:\Users\Rathindra\AppData\Local\Android\Sdk\platform-tools\adb.exe" shell am force-stop com.example.revautsav
```

### 2. Lock the tablet (Set Kiosk Launcher and Start App)
```powershell
# 1. Set Kiosk app as default home launcher:
& "C:\Users\Rathindra\AppData\Local\Android\Sdk\platform-tools\adb.exe" shell cmd package set-home-activity com.example.revautsav/.MainActivity

# 2. Launch Kiosk app with lock intent:
& "C:\Users\Rathindra\AppData\Local\Android\Sdk\platform-tools\adb.exe" shell am start -n com.example.revautsav/.MainActivity --es "action" "lock"
```

### 3. Uninstall / Disable Admin Privileges Completely
```powershell
& "C:\Users\Rathindra\AppData\Local\Android\Sdk\platform-tools\adb.exe" shell dpm remove-active-admin com.example.revautsav/.KioskDeviceAdminReceiver
```

---

## 🛠️ Troubleshooting & Notes

* **Device is not detected:**  
  Make sure your tablet is connected via USB and USB Debugging is turned on in the tablet's developer settings.
* **App is not locking on open:**  
  If you ran `kiosk_remove_admin.bat`, the app will behave like a normal app. To lock it again, run this command in terminal to set the app as the administrator:
  ```powershell
  & "C:\Users\Rathindra\AppData\Local\Android\Sdk\platform-tools\adb.exe" shell dpm set-device-owner com.example.revautsav/.KioskDeviceAdminReceiver
  ```
