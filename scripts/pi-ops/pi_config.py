"""Shared SSH access for the Pi operations tools.

No host, user or password lives in code. Everything comes from environment variables (or the git-ignored file
scripts/pi-ops/pi-hosts.env, see pi-hosts.example.env). Per kiosk `CV-001` / `SV-002` the variables are:

    PI_CV001_HOST, PI_CV001_USER, PI_CV001_PASSWORD | PI_CV001_KEY_FILE, [PI_CV001_SUDO_PASSWORD], [PI_CV001_LAN_HOST]
    PI_SV002_HOST, ...

Command strings may contain placeholders that are expanded only at the moment a command is sent:

    @SUDO@          -> echo '<sudo password of the connected kiosk>' | sudo -S
    @SUDO:SV-002@   -> the same for a specific kiosk (used when hopping from one Pi to the other)
    @LAN:SV-002@    -> that kiosk's PI_SV002_LAN_HOST
"""
import os
import re
import shlex
from pathlib import Path

import paramiko

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[1]
# Master copy of the listener that both Pis run (see docs/setup/pi-hardware.md)
LISTENER_PATH = REPO_ROOT / "pi_scripts" / "firebase_listener.py"
KIOSKS = ("CV-001", "SV-002")
ENV_FILE = HERE / "pi-hosts.env"

_PLACEHOLDER = re.compile(r"@(SUDO|LAN)(?::([A-Z]{2}-\d{3}))?@")


class ConfigError(RuntimeError):
    """A required environment variable is missing."""


def load_env_file(path=ENV_FILE):
    """Read KEY=VALUE lines from the git-ignored pi-hosts.env without overriding real environment variables."""
    if not Path(path).exists():
        return
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def normalize(kiosk):
    kiosk = (kiosk or "").upper()
    if kiosk not in KIOSKS:
        raise ConfigError(f"Unknown kiosk '{kiosk}'. Use one of: {', '.join(KIOSKS)}")
    return kiosk


def var_name(kiosk, field):
    return f"PI_{normalize(kiosk).replace('-', '')}_{field}"


def setting(kiosk, field, required=True):
    load_env_file()
    name = var_name(kiosk, field)
    value = os.environ.get(name)
    if not value and required:
        raise ConfigError(f"{name} is not set. Copy scripts/pi-ops/pi-hosts.example.env to pi-hosts.env and fill it in.")
    return value


def sudo_prefix(kiosk):
    password = setting(kiosk, "SUDO_PASSWORD", required=False) or setting(kiosk, "PASSWORD")
    return f"echo {shlex.quote(password)} | sudo -S"


def expand(command, kiosk=None):
    """Replace @SUDO@ / @SUDO:ID@ / @LAN:ID@ placeholders in a command string."""
    def repl(match):
        kind, target = match.group(1), match.group(2) or kiosk
        if kind == "SUDO":
            return sudo_prefix(target)
        return setting(target, "LAN_HOST")
    return _PLACEHOLDER.sub(repl, command)


class PiClient(paramiko.SSHClient):
    """SSHClient that expands the placeholders above in every command."""

    kiosk = None

    def exec_command(self, command, *args, **kwargs):
        return super().exec_command(expand(command, self.kiosk), *args, **kwargs)


def new_client():
    client = PiClient()
    # AutoAddPolicy silently trusts unknown hosts; only do that when explicitly asked (PI_ACCEPT_NEW_HOST_KEYS=1).
    client.load_system_host_keys()
    if os.environ.get("PI_ACCEPT_NEW_HOST_KEYS") == "1":
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    else:
        client.set_missing_host_key_policy(paramiko.WarningPolicy())
    return client


def connect(client, kiosk, timeout=15):
    """Open the SSH connection to a kiosk using password or key file from the environment."""
    kiosk = normalize(kiosk)
    key_file = setting(kiosk, "KEY_FILE", required=False)
    kwargs = {"username": setting(kiosk, "USER"), "timeout": timeout}
    if key_file:
        kwargs["key_filename"] = os.path.expanduser(key_file)
    else:
        kwargs["password"] = setting(kiosk, "PASSWORD")
    client.connect(setting(kiosk, "HOST"), **kwargs)
    client.kiosk = kiosk
    return client
