#!/usr/bin/env bash
# Make the Pi render every copy itself instead of asking the Brother printer to repeat pages.
#
# Why: both Brother queues use brlaser with `*cupsManualCopies: False`, so for a 4-copy order CUPS renders each
# page once and sends the printer a PCL "number of copies" command (ESC &l4X). Copies 2..N then exist only inside
# the printer. On 29 Sep 10:48 a 3-page x 4-copy order on MIMO 1.0 came out as blank sheets and the customer
# reprinted twice; single-copy prints of the same file were fine. Measured offline with cupsfilter on MIMO 1.0:
#   current setting, 3 copies -> 508,050 bytes (same as 1 copy: the printer is left to make the copies)
#   manual copies,   3 copies -> 1,462,397 bytes (every copy is a real page from the Pi)
#
# The change is one PPD line, installed with lpadmin (no CUPS restart, queue and connection unchanged).
#
# Usage (on either Pi):
#   sudo bash set_manual_copies.sh              # diagnose only: show the setting and an offline 1-vs-3-copy test
#   sudo bash set_manual_copies.sh --apply      # back up the PPD and switch to Pi-rendered copies
#   sudo bash set_manual_copies.sh --rollback   # restore the most recent backup
set -u

MODE="${1:-diagnose}"
BACKUP_ROOT=/root/mimo-ppd-backups
[ "$(id -u)" = 0 ] || { echo "Run with sudo."; exit 1; }

QUEUE="${QUEUE:-$(lpstat -e | grep -E '^Brother_HL_(L5210DN|L2440DW)_series$' | head -1)}"
[ -n "$QUEUE" ] || { echo "No Brother B&W queue found."; exit 1; }
PPD="/etc/cups/ppd/$QUEUE.ppd"
[ -f "$PPD" ] || { echo "Missing $PPD"; exit 1; }

setting() { grep -m1 '^\*cupsManualCopies:' "$1" | awk '{print $2}'; }

offline_test() {
  local ppd="$1" pdf out
  pdf=$(ls /usr/share/cups/data/default-testpage.pdf 2>/dev/null | head -1)
  [ -n "$pdf" ] || { echo "(no CUPS test page for the offline check)"; return; }
  out=$(mktemp)
  for c in 1 3; do
    /usr/sbin/cupsfilter -p "$ppd" -m printer/foo -o copies="$c" "$pdf" > "$out" 2>/dev/null
    echo "  $c cop$( [ "$c" = 1 ] && echo y || echo ies ): $(stat -c %s "$out") bytes would be sent to the printer"
  done
  rm -f "$out"
}

echo "Queue: $QUEUE"
echo "cupsManualCopies: $(setting "$PPD")   (True = Pi renders every copy)"

case "$MODE" in
  diagnose)
    echo "Offline test (nothing is printed):"
    offline_test "$PPD"
    ;;
  --apply)
    if [ "$(setting "$PPD")" = "True" ]; then echo "Already applied."; exit 0; fi
    if lpstat -o "$QUEUE" 2>/dev/null | grep -q .; then echo "❌ Jobs are in the queue; try again when the printer is idle."; exit 1; fi
    mkdir -p "$BACKUP_ROOT"
    backup="$BACKUP_ROOT/$QUEUE.$(date +%Y%m%d-%H%M%S).ppd"
    cp -p "$PPD" "$backup" && echo "Backup: $backup"
    tmp=$(mktemp --suffix=.ppd)
    sed 's/^\*cupsManualCopies: False/*cupsManualCopies: True/' "$PPD" > "$tmp"
    lpadmin -p "$QUEUE" -P "$tmp" && rm -f "$tmp"
    [ "$(setting "$PPD")" = "True" ] || { echo "❌ Setting did not take; restore with --rollback"; exit 1; }
    cupsenable "$QUEUE"; cupsaccept "$QUEUE"
    echo "✅ Applied. Queue state: $(lpstat -p "$QUEUE" | head -1)"
    echo "Offline test with the live PPD:"
    offline_test "$PPD"
    ;;
  --rollback)
    backup=$(ls -1t "$BACKUP_ROOT/$QUEUE".*.ppd 2>/dev/null | head -1)
    [ -n "$backup" ] || { echo "No backup found in $BACKUP_ROOT"; exit 1; }
    lpadmin -p "$QUEUE" -P "$backup" && cupsenable "$QUEUE" && cupsaccept "$QUEUE"
    echo "Restored $backup -> cupsManualCopies: $(setting "$PPD")"
    ;;
  *) echo "Unknown mode: $MODE"; exit 1 ;;
esac
