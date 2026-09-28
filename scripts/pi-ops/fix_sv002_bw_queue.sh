#!/usr/bin/env bash
# MIMO 2.0 (SV-002) — repair the black-and-white print queue.
#
# Symptom (reproduced 28 Sep 15:25): a 1-page, 1-copy B&W job is accepted and reported complete by CUPS, but the
# Brother keeps feeding blank sheets until cancelled on the printer. The job data is correct; the B&W queue sends
# the printer a print language it cannot render. Colour (Epson) works and is left alone.
#
# The fix: rebuild the B&W queue as a driverless (IPP Everywhere) queue over IPP-over-USB, so the printer receives
# its own native format. Same queue name, so the listener needs no change.
#
# Usage (on the SV-002 Pi):
#   sudo bash fix_sv002_bw_queue.sh              # 1. diagnose only — changes nothing
#   sudo bash fix_sv002_bw_queue.sh --apply      # 2. back up, clear stuck B&W jobs, rebuild the B&W queue
#   sudo bash fix_sv002_bw_queue.sh --test       # 3. print ONE line of text on the B&W printer
#   sudo bash fix_sv002_bw_queue.sh --rollback   #    restore the backup taken by --apply
set -u

BW_QUEUE="${BW_QUEUE:-Brother_HL_L2440DW_series}"
COLOR_QUEUE="${COLOR_QUEUE:-Epson_L3250}"
BACKUP_ROOT=/root/mimo-bw-queue-backups
QUIRK=/etc/ipp-usb/quirks/zz-mimo-keep-epson-direct.conf
MODE="${1:-diagnose}"

[ "$(id -u)" = 0 ] || { echo "Run with sudo."; exit 1; }
say() { echo; echo "===== $* ====="; }
die() { echo "❌ $*"; exit 1; }

diagnose() {
  say "All queues and their connections";      lpstat -v 2>&1
  say "B&W queue state";                       lpstat -p "$BW_QUEUE" 2>&1
  say "Jobs waiting in CUPS";                   lpstat -o 2>&1 || true
  say "B&W driver in use"
  if [ -f "/etc/cups/ppd/$BW_QUEUE.ppd" ]; then
    grep -iE '^\*(NickName|PCFileName|cupsFilter2?|Manufacturer|ModelName)' "/etc/cups/ppd/$BW_QUEUE.ppd"
  else
    echo "(no PPD for $BW_QUEUE)"
  fi
  say "ipp-usb service";                        echo "enabled: $(systemctl is-enabled ipp-usb 2>&1)  active: $(systemctl is-active ipp-usb 2>&1)"
  say "Printers on USB";                        lsusb | grep -iE 'brother|epson' || echo "(neither printer visible on USB)"
  say "Driverless printers discovered";         (command -v driverless >/dev/null && timeout 20 driverless 2>/dev/null) || echo "(none / driverless tool missing)"
  say "Last CUPS errors";                       tail -n 40 /var/log/cups/error_log 2>/dev/null || true
  say "Listener code that switches ipp-usb off"
  for f in /home/pi/mimo/firebase_listener.py /home/pi/firebase_listener.py; do
    [ -f "$f" ] && { echo "$f:"; grep -n "ipp-usb" "$f" || echo "  (none)"; }
  done
}

find_bw_ipp_uri() {
  # 1) what cups-filters' driverless discovery reports for the Brother
  if command -v driverless >/dev/null; then
    uri=$(timeout 20 driverless 2>/dev/null | grep -iE 'brother|L2440' | head -n1)
    [ -n "$uri" ] && { echo "$uri"; return 0; }
  fi
  # 2) probe ipp-usb's local ports directly
  for port in 60000 60001 60002 60003; do
    if timeout 5 ipptool -t "ipp://localhost:$port/ipp/print" get-printer-attributes.test 2>/dev/null | grep -qi brother; then
      echo "ipp://localhost:$port/ipp/print"; return 0
    fi
  done
  return 1
}

apply() {
  lsusb | grep -qi brother || die "The Brother is not visible on USB. Check its power and USB cable, then re-run."
  ts=$(date +%Y%m%d-%H%M%S); b="$BACKUP_ROOT/$ts"; mkdir -p "$b"
  cp -a /etc/cups/printers.conf "$b/" 2>/dev/null
  cp -a /etc/cups/ppd "$b/" 2>/dev/null
  echo "ippusb_enabled=$(systemctl is-enabled ipp-usb 2>/dev/null)" >  "$b/state"
  echo "ippusb_active=$(systemctl is-active ipp-usb 2>/dev/null)"   >> "$b/state"
  echo "✅ Backup: $b"

  say "Clearing stuck jobs on the B&W queue only (colour queue untouched)"
  cancel -a "$BW_QUEUE" 2>/dev/null; lpstat -o "$BW_QUEUE" 2>/dev/null || true

  # Keep the Epson on its current direct connection: without this, starting ipp-usb could claim the Epson's USB
  # interface and break the working colour queue.
  if lpstat -v "$COLOR_QUEUE" 2>/dev/null | grep -q 'usb://'; then
    mkdir -p /etc/ipp-usb/quirks
    printf '# MIMO: the Epson colour printer stays on its direct usb:// queue\n[EPSON*]\n  blacklist = true\n' > "$QUIRK"
    echo "✅ ipp-usb told to leave the Epson alone ($QUIRK)"
  fi

  say "Starting ipp-usb"
  systemctl unmask ipp-usb >/dev/null 2>&1
  systemctl enable ipp-usb >/dev/null 2>&1
  systemctl restart ipp-usb || die "ipp-usb failed to start (is the ipp-usb package installed? apt install ipp-usb). Run --rollback to undo."

  uri=""
  for _ in $(seq 1 15); do uri=$(find_bw_ipp_uri) && break; sleep 2; done
  [ -n "$uri" ] || die "The Brother did not appear as a driverless printer. Only ipp-usb was changed; run --rollback to undo."
  echo "✅ Brother found at: $uri"

  say "Rebuilding $BW_QUEUE as a driverless queue"
  lpadmin -x "$BW_QUEUE" 2>/dev/null
  lpadmin -p "$BW_QUEUE" -E -v "$uri" -m everywhere -o media-default=iso_a4_210x297mm -o print-color-mode-default=monochrome \
    || die "lpadmin failed; run --rollback to restore the old queue."
  cupsenable "$BW_QUEUE"; cupsaccept "$BW_QUEUE"
  lpstat -p "$BW_QUEUE" -v "$BW_QUEUE"

  say "Colour queue check (must be unchanged)"
  lpstat -p "$COLOR_QUEUE" -v "$COLOR_QUEUE"

  # Some listener versions stop and disable ipp-usb when a Brother job looks stuck, which would break this queue again.
  for f in /home/pi/mimo/firebase_listener.py /home/pi/firebase_listener.py; do
    if [ -f "$f" ] && grep -qE 'systemctl (stop|disable) ipp-usb' "$f"; then
      saved="$b/listener.$(echo "$f" | md5sum | cut -c1-8)"
      cp -a "$f" "$saved"; echo "$f" > "$saved.path"
      sed -i -E 's/^([[:space:]]*)(subprocess\.run\(.*systemctl (stop|disable) ipp-usb.*)$/\1pass  # MIMO: ipp-usb must stay on for the B\&W queue: \2/' "$f"
      if python3 -m py_compile "$f"; then
        echo "✅ $f no longer switches ipp-usb off (takes effect at the next listener restart; original saved)"
      else
        cp -a "$saved" "$f"; echo "⚠️ could not patch $f safely — restored it unchanged"
      fi
    fi
  done

  echo; echo "Done. Now run:  sudo bash $0 --test   (prints ONE line of text on the B&W printer)"
}

test_print() {
  printf 'MIMO 2.0 black-and-white test %s\n' "$(date)" | lp -d "$BW_QUEUE" -n 1 -t "MIMO B&W test" \
    && echo "Sent ONE page. Expect exactly one sheet with one line of text. If blank sheets keep coming, cancel on the printer and run --rollback."
}

rollback() {
  last=$(ls -1d "$BACKUP_ROOT"/* 2>/dev/null | tail -n1)
  [ -n "$last" ] || die "No backup found in $BACKUP_ROOT."
  echo "Restoring $last"
  systemctl stop cups
  cp -a "$last/printers.conf" /etc/cups/printers.conf
  if [ -d "$last/ppd" ]; then rm -rf /etc/cups/ppd.mimo-rollback; mv /etc/cups/ppd /etc/cups/ppd.mimo-rollback; cp -a "$last/ppd" /etc/cups/ppd; fi
  rm -f "$QUIRK"
  for p in "$last"/listener.*.path; do
    [ -f "$p" ] || continue
    cp -a "${p%.path}" "$(cat "$p")"
  done
  . "$last/state"
  [ "${ippusb_active:-}" = "active" ] || systemctl stop ipp-usb 2>/dev/null
  [ "${ippusb_enabled:-}" = "enabled" ] || systemctl disable ipp-usb 2>/dev/null
  systemctl start cups
  lpstat -v
  echo "✅ Rolled back."
}

case "$MODE" in
  diagnose|"") diagnose ;;
  --apply)     apply ;;
  --test)      test_print ;;
  --rollback)  rollback ;;
  *) echo "Usage: sudo bash $0 [--apply|--test|--rollback]"; exit 2 ;;
esac
