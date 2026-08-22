@echo off
title MIMO Kiosk Admin Remover
echo ===================================================
echo   🚫 MIMO KIOSK ADMIN REMOVER
echo   Removing administrator and device owner rights...
echo ===================================================
echo.

"C:\Users\Rathindra\AppData\Local\Android\Sdk\platform-tools\adb.exe" shell dpm remove-active-admin com.example.revautsav/.KioskDeviceAdminReceiver

if %ERRORLEVEL% equ 0 (
    echo.
    echo 🌟 SUCCESS: Administrator rights removed!
    echo You can now uninstall the app or use the tablet normally.
) else (
    echo.
    echo ❌ ERROR: Failed to remove administrator rights. Make sure your tablet is connected via USB.
)

echo.
echo Press any key to close...
pause >nul
