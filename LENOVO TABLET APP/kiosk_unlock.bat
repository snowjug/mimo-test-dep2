@echo off
title MIMO Kiosk Unlocker
echo ===================================================
echo   🔓 MIMO KIOSK UNLOCKER
echo   Stopping app and unlocking tablet...
echo ===================================================
echo.

echo [1/3] Sending unlock signal to Kiosk app...
"C:\Users\Rathindra\AppData\Local\Android\Sdk\platform-tools\adb.exe" shell am start -n com.example.revautsav/.MainActivity --es "action" "unlock"

echo.
echo [2/3] Resetting home screen to standard Lenovo launcher...
"C:\Users\Rathindra\AppData\Local\Android\Sdk\platform-tools\adb.exe" shell cmd package set-home-activity com.tblenovo.launcher/com.tblenovo.launcher.TabUILauncher

echo.
echo [3/3] Stopping Kiosk app...
"C:\Users\Rathindra\AppData\Local\Android\Sdk\platform-tools\adb.exe" shell am force-stop com.example.revautsav

if %ERRORLEVEL% equ 0 (
    echo.
    echo 🌟 SUCCESS: Tablet has been unlocked!
) else (
    echo.
    echo ❌ ERROR: Failed to unlock. Make sure your tablet is connected via USB.
)

echo.
echo Closing in 5 seconds...
timeout /t 5 >nul
