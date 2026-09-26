#!/usr/bin/env python3
"""Everyday Raspberry Pi operations for the MIMO kiosks, one command instead of many one-off scripts.

    python pi_ops.py <CV-001|SV-002> <command> [options]

Commands
    status                 systemctl status of mimo-listener
    logs [-n 100] [-g TXT] journal of mimo-listener (last N lines, optionally filtered case-insensitively)
    service                the installed systemd unit file
    restart | stop | start control the mimo-listener service (sudo)
    printers               CUPS printers, default printer and queued jobs
    processes              python / listener processes
    files                  listener and downloads folders on the Pi
    listener               print the listener source currently installed on the Pi
    tools                  check that pdftk / qpdf are installed
    pull                   `git pull` in ~/mimo on the Pi, then restart the service

Hosts and credentials come from pi_config (environment or scripts/pi-ops/pi-hosts.env).
"""
import argparse
import shlex
import sys

import pi_config as pi

SERVICE = "mimo-listener.service"


def build_command(command, lines=100, grep=None):
    """Return the shell command (with @SUDO@ placeholders) for an operation."""
    lines = int(lines)
    if command == "status":
        return f"systemctl status {SERVICE} --no-pager"
    if command == "logs":
        base = f"journalctl -u {SERVICE} --no-pager"
        if grep:
            return f"{base} | grep -i {shlex.quote(grep)} | tail -n {lines}"
        return f"{base} -n {lines}"
    if command == "service":
        return f"cat /etc/systemd/system/{SERVICE}"
    if command in ("restart", "stop", "start"):
        return f"@SUDO@ systemctl {command} {SERVICE}"
    if command == "printers":
        return "lpstat -p -d; lpstat -o"
    if command == "processes":
        return "ps aux | grep -E 'python|firebase_listener' | grep -v grep"
    if command == "files":
        return "ls -la ~/mimo ~/mimo/downloads ~ 2>&1"
    if command == "listener":
        return "cat ~/mimo/firebase_listener.py 2>/dev/null || cat ~/firebase_listener.py"
    if command == "tools":
        return "which pdftk qpdf"
    if command == "pull":
        return f"cd ~/mimo && git pull origin main && @SUDO@ systemctl restart {SERVICE}"
    raise ValueError(f"unknown command: {command}")


COMMANDS = ("status", "logs", "service", "restart", "stop", "start", "printers", "processes", "files", "listener", "tools", "pull")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("kiosk", help="CV-001 (MIMO 1.0) or SV-002 (MIMO 2.0)")
    parser.add_argument("command", choices=COMMANDS)
    parser.add_argument("-n", "--lines", type=int, default=100)
    parser.add_argument("-g", "--grep", help="filter for the logs command")
    parser.add_argument("-y", "--yes", action="store_true", help="do not ask before restart/stop/start/pull")
    args = parser.parse_args(argv)

    try:
        kiosk = pi.normalize(args.kiosk)
    except pi.ConfigError as exc:
        parser.error(str(exc))

    if args.command in ("restart", "stop", "start", "pull") and not args.yes:
        if input(f"{args.command} the listener on {kiosk}? This interrupts printing there. Type 'yes': ").strip().lower() != "yes":
            print("Cancelled.")
            return 1

    client = pi.new_client()
    try:
        pi.connect(client, kiosk)
        _, stdout, stderr = client.exec_command(build_command(args.command, args.lines, args.grep))
        out = stdout.read().decode("utf-8", errors="replace")
        err = stderr.read().decode("utf-8", errors="replace")
        if out.strip():
            print(out.rstrip())
        if err.strip():
            print("--- stderr ---\n" + err.rstrip(), file=sys.stderr)
        return stdout.channel.recv_exit_status()
    except pi.ConfigError as exc:
        print(f"Configuration error: {exc}", file=sys.stderr)
        return 2
    except Exception as exc:  # noqa: BLE001 - operator tool: show the reason, do not crash with a traceback
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    finally:
        client.close()


if __name__ == "__main__":
    sys.exit(main())
