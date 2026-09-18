$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"

Write-Output "=== ADB DEVICES ==="
& $adb devices

Write-Output "`n=== DPM LIST OWNERS ==="
& $adb shell dpm list-owners

Write-Output "`n=== DUMPSYS DEVICE_POLICY DEVICE OWNER ==="
& $adb shell "dumpsys device_policy" | Select-String -Pattern "Device Owner"

Write-Output "`n=== PM LIST REVAUTSAV ==="
& $adb shell "pm list packages" | Select-String -Pattern "revautsav"

Write-Output "`n=== PM LIST KIOSKLAUNCHER ==="
& $adb shell "pm list packages" | Select-String -Pattern "kiosklauncher"

Write-Output "`n=== DUMPSYS ACTIVITY MCURRENTFOCUS ==="
& $adb shell "dumpsys activity activities" | Select-String -Pattern "mCurrentFocus"
