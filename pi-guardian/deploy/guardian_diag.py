"""One-off diagnostic: runs exactly one real Guardian cycle (SubprocessRunner/SocketProbe --
the same classes the live systemd service uses, nothing mocked) and attempts to publish it,
printing the PublishResult. Run this manually to see WHY the live service isn't getting
telemetry into the dashboard; it never modifies anything and uses the service's own
GUARDIAN_API_HOST / GUARDIAN_DERIVED_KEY_HEX / GUARDIAN_KEY_VERSION environment variables.

Usage (on the kiosk, as root, with the service's own env):
  sudo -u mimo-guardian bash -c 'set -a; source /etc/mimo-guardian/guardian.env; set +a; \
    cd /opt/mimo-guardian && python3 /tmp/guardian_diag.py --config /etc/mimo-guardian/guardian-config.json'
"""
import argparse
import os
import sys

sys.path.insert(0, os.getcwd())

from guardian.config import load_config
from guardian.probes import HostReader, SocketHttpsClient, SocketProbe
from guardian.publisher import Publisher
from guardian.runner import SubprocessRunner
from guardian.scheduler import Scheduler
from guardian.service import publisher_from_env


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True)
    args = ap.parse_args()

    config = load_config(args.config)
    sched = Scheduler(config, SubprocessRunner(), SocketProbe(), HostReader())
    publisher = publisher_from_env(os.environ)

    print("Running one collection cycle...")
    snapshot = sched.run_cycle()
    print(f"kioskId={snapshot.get('kioskId')} seq={snapshot.get('seq')} overall={snapshot.get('diagnosis', {}).get('overall')}")

    print("Attempting to publish...")
    result = publisher.publish(snapshot)
    print(f"status={result.status} http_status={result.http_status} attempts={result.attempts} detail={result.detail!r}")


if __name__ == "__main__":
    main()
