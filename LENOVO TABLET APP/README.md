# Android kiosk shell (`LENOVO TABLET APP/`)

**Responsibility:** a minimal Kotlin app that turns a tablet into a locked-down kiosk. It shows the kiosk web UI full-screen in a `WebView`, keeps the screen on, and can be put in (or taken out of) Android *lock task* mode. It contains **no business logic** — everything visible comes from the kiosk UI.

## What is in here
| Path | Purpose |
|---|---|
| `app/src/main/java/com/example/revautsav/MainActivity.kt` | The only screen: full-screen `WebView` that loads the kiosk UI (`mimo-kiosk-app.vercel.app`), keeps the screen on, applies immersive mode and handles `lock` / `unlock` start intents |
| `app/src/main/java/com/example/revautsav/KioskDeviceAdminReceiver.kt` | Device-admin / device-owner receiver required for lock task mode |
| `app/build.gradle.kts` | `applicationId com.example.revautsav`, `minSdk 24`, `targetSdk 36`, version `1.0` |
| `kiosk_lock.bat`, `kiosk_unlock.bat`, `kiosk_unlock.sh`, `kiosk_remove_admin.bat` | ADB helper scripts (Windows batch; one shell variant) |
| `KIOSK_GUIDE.md`, `ADB_Commands.md` | Operator guides (contain example Windows paths) |

## How it talks to the rest of the system
It only loads a URL: the Vercel deployment of the kiosk UI ([`mimo-frontend-web-app/mimo-frontend`](../mimo-frontend-web-app/mimo-frontend/README.md)). The kiosk UI then calls the API. Changing what the tablet shows means deploying the kiosk UI, not rebuilding this app. The URL is a constant in `MainActivity.kt`.

## Build and install (*unverified in the documentation audit*)
Requires Android Studio (or JDK + Android SDK). From this folder:
```bash
./gradlew assembleDebug          # Windows: gradlew.bat assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```
Lock / unlock a tablet over ADB — see `KIOSK_GUIDE.md`; for example `adb shell am start -n com.example.revautsav/.MainActivity --es "action" "unlock"`.
Lock task mode needs the app to be **device owner**; `kiosk_remove_admin.bat` removes that status (needed before uninstalling).

## Dependencies and configuration
No environment variables and no secrets. The kiosk URL and machine identity are decided by the web app (`?kioskId=`, see the kiosk README).

## Testing
Only the generated example tests exist (`ExampleUnitTest`, `ExampleInstrumentedTest`); there is no automated test of the lock behaviour. Test on a spare tablet.

## Common problems
| Symptom | Cause / fix |
|---|---|
| Cannot leave the app | Send the `unlock` intent (see `KIOSK_GUIDE.md`) |
| Cannot uninstall | Remove device-owner status first (`kiosk_remove_admin.bat`) |
| Blank screen | Tablet offline or the kiosk deployment is down — open the kiosk URL in a browser |

Related: [`architecture.md` §3, §9](../architecture.md) · [`docs/setup/pi-hardware.md`](../docs/setup/pi-hardware.md).
