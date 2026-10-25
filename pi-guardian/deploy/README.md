# Deploying Guardian to a real kiosk

This directory holds the templates for running Guardian as a continuous, read-only reporting
service on a real Raspberry Pi kiosk (`guardian/service.py`), separate in process and code from
the print listener. Nothing here has been run against a real device yet.

## 0. Prerequisites (already done, once, backend-side)

1. The kiosk must already exist in the `guardian_kiosks` Firestore registry (see
   `functions/src/guardian/registry.js`'s `provisionKiosk`) with `status: "ACTIVE"` and an
   `activeKeyVersion`.
2. `GUARDIAN_MASTER_KEY` must exist as a real secret bound to the deployed Cloud Function
   (`functions/index.js` already lists it in the `onRequest` secrets array). This repo never
   contains its value.

## 1. Compute this kiosk's derived key (once, off this repo's normal working copy)

The master key is never installed on a kiosk, never stored in this repo, and never typed into this
assistant session. Whoever holds `GUARDIAN_MASTER_KEY` runs this once per kiosk, on a machine they
trust, then immediately clears their shell history / closes the terminal:

```bash
cd pi-guardian
python3 -c "
from guardian.crypto import derive_kiosk_key
print(derive_kiosk_key('<GUARDIAN_MASTER_KEY hex value>', '<KIOSK_ID e.g. CV-001>', <activeKeyVersion from the registry>).hex())
"
```

That prints the 64-hex-character **derived per-kiosk key** -- this is what goes into
`guardian.env` below. The master key itself never leaves that one command.

## 2. Prepare the files for this kiosk

- Copy `guardian-config.example.json` -> fill in this kiosk's real `kiosk_id` and endpoints
  (the `endpoints` list should include the production backend host and at least one independent
  host, e.g. a public DNS resolver, per Phase 1's connectivity-check design).
- Copy `guardian.env.example` -> fill in `GUARDIAN_DERIVED_KEY_HEX` (from step 1) and
  `GUARDIAN_KEY_VERSION` (matching the registry's `activeKeyVersion`).

## 3. Pre-flight checks on the device (do this before copying anything)

Hardware specs for CV-001/SV-002 aren't documented anywhere in this repo -- check the real device,
don't assume:

```bash
df -h /                 # confirm free disk space (Guardian's own footprint is ~200 KB all-in,
                         # but a kiosk already low on space shouldn't get anything new added)
free -h                  # confirm free RAM headroom relative to MemoryMax=64M below
python3 --version        # confirm 3.11.x (the documented Pi OS version; CLAUDE.md)
systemctl is-active mimo-listener.service   # confirm the print listener is healthy BEFORE touching anything
```

## 4. Install on the device

Copy **only** these 12 files from `pi-guardian/guardian/` -- not the whole directory. `simulation.py`
(offline test fixtures) and `__main__.py` (the separate stdout-only debug entrypoint) are not
imported by `guardian/service.py` and add nothing on a real device:
`__init__.py classifier.py collectors.py config.py crypto.py model.py probes.py publisher.py
runner.py scheduler.py service.py snapshot.py`

```bash
# Dedicated, unprivileged system user -- nothing Guardian runs needs root (see runner.py's
# allowlist: ip, systemctl show, lpstat -r, tailscale status --json, getent,
# tail -n 20 /var/log/cups/error_log -- all read-only).
sudo useradd --system --no-create-home --shell /usr/sbin/nologin mimo-guardian
# Optional: lets the cups_scheduler check's FAIL detail include a short error_log excerpt
# (collectors.py's _cups_error_tail). Without this, that tail just reads PERMISSION_DENIED and the
# check's state is completely unaffected -- the main lpstat -r check never depends on it.
sudo usermod -aG lpadmin mimo-guardian

sudo mkdir -p /opt/mimo-guardian/guardian /etc/mimo-guardian
for f in __init__.py classifier.py collectors.py config.py crypto.py model.py probes.py \
         publisher.py runner.py scheduler.py service.py snapshot.py; do
  sudo cp "pi-guardian/guardian/$f" /opt/mimo-guardian/guardian/
done
sudo cp deploy/guardian-config.json /etc/mimo-guardian/guardian-config.json
sudo cp deploy/guardian.env /etc/mimo-guardian/guardian.env
sudo chown -R mimo-guardian:mimo-guardian /opt/mimo-guardian /etc/mimo-guardian
sudo chmod 600 /etc/mimo-guardian/guardian.env
sudo cp deploy/mimo-guardian.service /etc/systemd/system/mimo-guardian.service
sudo systemctl daemon-reload
sudo systemctl enable --now mimo-guardian.service
```

## 5. Verify

```bash
sudo systemctl status mimo-guardian.service      # active (running), no restart loop
sudo systemctl status mimo-listener.service      # still healthy, completely unaffected
du -sh /opt/mimo-guardian /etc/mimo-guardian      # should be well under 1 MB
```

Within one `cycle_interval_s` (default 60s), the kiosk's document should appear in
`guardian_health_latest`, and `GET /admin/guardian/health` / the Edge Guardian dashboard page
should show it immediately -- no backend or frontend change is needed for this.

## 6. Rollout order

Install on **one kiosk first** (`CV-001`), and watch it (service status, journal, and that the
listener/print flow is completely unaffected) for a full day before touching `SV-002`. Don't do
both at once.

## 7. Rollback

```bash
sudo systemctl disable --now mimo-guardian.service
sudo rm -rf /opt/mimo-guardian /etc/mimo-guardian /etc/systemd/system/mimo-guardian.service
sudo systemctl daemon-reload
sudo userdel mimo-guardian
```
This never touches the listener, CUPS, or any print-path file -- Guardian owns nothing outside
`/opt/mimo-guardian` and `/etc/mimo-guardian`.

## Explicitly out of scope here

This directory only prepares what an install *would* look like. Actually running step 4 against
`CV-001`/`SV-002` requires real SSH access to those devices (see `scripts/pi-ops/` and its
`pi-hosts.env`, which is not filled in on this machine) and separate, explicit authorization --
per this repo's own standing rule, nothing automated here ever touches a live kiosk on its own.
