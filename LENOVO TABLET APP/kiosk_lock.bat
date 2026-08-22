@echo off
title MIMO Kiosk Locker
echo ===================================================
echo   🔒 MIMO KIOSK LOCKER
echo   Setting launcher and locking tablet...
echo ===================================================
echo.

echo [1/3] Enforcing 3-button navigation (removes swipe-up gesture bar)...
"C:\Users\Rathindra\AppData\Local\Android\Sdk\platform-tools\adb.exe" shell settings put secure navigation_mode 0

echo.
echo [2/3] Setting Kiosk app as default home screen...
"C:\Users\Rathindra\AppData\Local\Android\Sdk\platform-tools\adb.exe" shell cmd package set-home-activity com.example.revautsav/.MainActivity

echo.
echo [4/4] Launching Kiosk app with lock intent...
"C:\Users\Rathindra\AppData\Local\Android\Sdk\platform-tools\adb.exe" shell am start -n com.example.revautsav/.MainActivity --es "action" "lock"

if %ERRORLEVEL% equ 0 (
    echo.
    echo 🌟 SUCCESS: Tablet is now securely locked in Kiosk Mode.
) else (
    echo.
    echo ❌ ERROR: Failed to start app. Make sure your tablet is connected via USB.
)

echo.
echo Closing in 5 seconds...
timeout /t 5 >nul
