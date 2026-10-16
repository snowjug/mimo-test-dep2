# New Pi — Your Steps

Do these. Once step 3 is done (Pi connected to Tailscale), tell me and I'll take it from there.

## 1. Flash the SD card
- Raspberry Pi Imager → Raspberry Pi OS (64-bit)
- Advanced settings (gear icon): set hostname (e.g. `mimo3`), enable SSH, set username/password, pre-configure Wi-Fi
- Flash, insert card, power on, wait ~1 min

## 2. SSH in
```
ssh <username>@mimo3.local
```

## 3. Install Tailscale and connect
```
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```
Open the login link it prints, sign in with the same Tailscale account as `pi` and `printpi`.

**Done — tell me once this is connected. I'll handle everything else (software, printer, service, registration) from there.**
