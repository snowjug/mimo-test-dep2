# MIMO Edge Guardian — Architecture & Inspection Plan v0.1

## 1. Mission

Build a read-only, production-safe edge health and diagnosis agent for every MIMO Raspberry Pi kiosk.

Primary rule:

> The Guardian must never be required for printing to work, and Guardian failure must never stop the existing printing path.

Initial scope is observability and diagnosis. Automatic repair/control is explicitly out of scope for v1.

## 2. Production baseline

MIMO currently uses Raspberry Pi hardware nodes. The documented production listener runs as a persistent systemd service, listens for print-job changes through Firebase `on_snapshot()`, downloads documents, converts DOCX locally when needed, sends output to CUPS, and writes a hardware heartbeat every 30 seconds.

The documented admin surface is `/admin`; the documented kiosk data model includes `kiosk_machines/{kioskId}` with operational status, `lastHeartbeatAt`, printer levels and errors. A separate health-log direction is described for time-series telemetry.

## 3. Guardian responsibility

The Guardian answers five operational questions:

1. Is the Pi physically connected to a network?
2. Does it have a valid local network configuration?
3. Can it reach the local gateway and the wider Internet?
4. Can required control-plane/application services be reached?
5. If something is failing, what is the lowest failed layer and what failures are only consequences?

## 4. Layered architecture

```
                         MIMO CLOUD
                             |
                     Firestore / Admin
                             |
                      Health Publisher
                             |
                    +-------------------+
                    |  MIMO Edge        |
                    |     Guardian      |
                    +-------------------+
                       |       |       |
                 Observe   Diagnose   Report
                       |       |       |
      +----------------+-------+-------+----------------+
      |                |               |                |
  Physical          Network        Services         Printer
      |                |               |                |
  ethtool           IP/routes       systemd          CUPS
  link              ARP             Tailscale        lpstat
  speed             gateway         listener
  duplex            DNS             Docker(optional)
                    Internet
                       |
                   Linux kernel
                       |
               eth0 / wlan0 / tun*
```

## 5. Guardian v1 data domains

### Identity
- kioskId
- hostname
- agent version
- OS/kernel version
- MAC addresses (non-secret device identity)

### Ethernet/Wi-Fi
- interface name
- administrative state
- carrier/link state
- speed
- duplex
- Wi-Fi SSID/BSSID where appropriate
- Wi-Fi RSSI and bitrate where available

### IPv4
- address
- prefix
- method (DHCP/manual)
- default route
- DNS resolvers

### Local network diagnosis
- neighbour/ARP state for gateway
- gateway reachability
- gateway latency
- route validity

### Internet diagnosis
- IP reachability probe
- DNS resolution probe
- HTTPS probe
- latency
- packet loss where measurable

### Overlay/control plane
- Tailscale daemon state
- connected/disconnected
- Tailscale IP
- last successful control-plane observation

### MIMO service health
- listener systemd state
- listener process/PID if safe to observe
- CUPS state
- last successful Firebase interaction
- last heartbeat publication

### System resources
- uptime
- CPU utilization/load
- memory used/free
- disk free
- temperature if supported

## 6. Failure taxonomy

Guardian must classify failures from low level upward.

```
LINK_DOWN
NO_IPV4
INVALID_ROUTE
GATEWAY_ARP_FAILED
GATEWAY_UNREACHABLE
DNS_FAILURE
INTERNET_UNREACHABLE
HTTPS_FAILURE
TAILSCALE_FAILURE
FIREBASE_FAILURE
LISTENER_FAILURE
CUPS_FAILURE
HEALTHY
```

Rules:
- A lower-level failure suppresses misleading higher-level root-cause claims.
- Higher-level failures may be marked as CASCADE rather than ROOT_CAUSE.
- UNKNOWN is different from FAIL; a probe that cannot be run is not automatically a failure.

Example:

```
Ethernet              PASS
IPv4                  PASS
Route                 PASS
Gateway ARP           FAIL  <-- ROOT CAUSE
Internet              BLOCKED/CASCADE
Tailscale             CASCADE
Firebase              CASCADE
```

## 7. Safety architecture

### Hard isolation

Guardian is not on the printing critical path.

```
Guardian OFF        -> printing must still work
Guardian CRASH      -> printing must still work
Firestore DOWN      -> Guardian queues/skips reporting; printing logic is untouched
Guardian upgrade    -> old listener continues unchanged
```

### v1 is read-only

Guardian must not change:
- DHCP/static configuration
- routes
- firewall rules
- Tailscale configuration
- printer configuration
- listener configuration
- Docker configuration

### Resource budget

Guardian should have explicit CPU, memory and network limits. Collection must be lightweight; avoid frequent expensive scans and large logs.

### Reporting

Health snapshots should be bounded and schema-versioned. High-frequency raw diagnostics should remain local unless an incident or sampled telemetry policy requires publication.

## 8. Deployment topology

### Stage 0 — laptop/dev environment

Run individual collectors against mock fixtures or a development Linux host.

### Stage 1 — staging Raspberry Pi

Guardian enabled. Existing production listener unchanged.

### Stage 2 — one kiosk canary

Enable reporting only. No remediation.

### Stage 3 — second production kiosk

Enable after canary stability is demonstrated.

## 9. Exact repository inspection order

### Tier A — mandatory before coding

1. `pi-listener/firebase_listener.py`
   - identify current heartbeat implementation
   - identify Firebase credentials and client initialization
   - identify Firestore paths
   - understand listener lifecycle and threads
   - identify what happens when network disappears/reappears

2. `mimo-test-dep2/mimo-listener.service`
3. `mimo-test-dep2/mimo-listener-1.service`
4. `mimo-test-dep2/mimo-listener-2.service`
   - determine which unit is actually used
   - command, user, working directory, environment, restart policy, dependencies

5. `mimo-test-dep2/monitor_pi.py`
   - existing telemetry and health checks
   - avoid duplicating logic

6. `mimo-test-dep2/pi_setup.sh`
   - network/service/bootstrap assumptions

7. `mimo-test-dep2/fallback_wifi.sh`
   - understand current network fallback behavior before building a competing manager

8. `mimo-test-dep2/deploy_listener.py`
   - understand how agent/listener updates reach production

### Tier B — backend/admin data path

9. `backend/api/check_system_status.js`
10. `backend/api/check_pi.py`
11. `backend/api/check_pi_logs.js`
12. `backend/api/check_service.js`
13. `backend/api/fetch_kiosk_listener.js`
14. `backend/api/firebase.js`
15. `backend/api/printpi_listener.py`
16. `backend/api/kiosk2_listener.py`
17. `backend/api/firebase_listener_kiosk2.py`
18. `backend/api/firebase_listener_kiosk2_latest.py`

Goal: determine which backend-side diagnostics and listener variants are real production dependencies and which are historical/debug artifacts.

### Tier C — schema/security/deployment

19. `firestore.rules`
20. `firestore.indexes.json`
21. `firebase.json`
22. `functions/index.js`
23. `mimo-backend/vercel.json`
24. `docs/FIREBASE_SCHEMA_DESIGN.md`
25. `docs/ARCHITECTURE.md`
26. `docs/DEPLOYMENT.md`
27. `docs/PRODUCTION_DEPLOYMENT_GUIDE.md`
28. `docs/troubleshooting_log.md`

Goal: establish the authoritative storage model, access model, deployment path and known failure modes.

### Tier D — admin UI

29. `mimo-admin-dashboard/` (if this directory is the current deployed admin)
30. inspect its `App.*`, Firebase client, data/API modules, environment configuration and deployment configuration.

Do not create a second dashboard until we have confirmed which dashboard is live.

### Tier E — security-sensitive material

31. `pi-listener/serviceAccountKey.json` / equivalent hardware credential

Do NOT copy, commit, print, or expose the credential. We only need to understand where it is loaded, which identity it uses, what permissions it has, and whether the Guardian should reuse or replace that trust path.

## 10. What must be understood in depth

### A. Current listener lifecycle

We need a sequence diagram from boot to steady state:

```
boot
 -> network init
 -> systemd
 -> listener process
 -> Firebase connection
 -> Firestore watch
 -> job execution
 -> status update
```

Also map restart behavior for each failure.

### B. Current heartbeat lifecycle

Need exact answers:
- what process emits it?
- how often?
- which document/path?
- which fields?
- what happens if Firestore is unreachable?
- can heartbeat publishing block printing?
- how is kiosk identity selected?

### C. Network truth sources

We need to choose authoritative local sources for each metric:

```
link/speed/duplex -> ethtool/sysfs
IP/routes         -> netlink/iproute2
DHCP state        -> NetworkManager/systemd-networkd, whichever owns eth0
ARP/neighbours    -> netlink/ip neigh
DNS               -> resolver subsystem
systemd state     -> systemd DBus/CLI
CUPS              -> lpstat/cups APIs
Tailscale         -> tailscale state interface
```

Do not scrape terminal output when a structured API is available.

### D. Probe semantics

Every probe needs:
- purpose
- timeout
- retry count
- interval
- success criterion
- failure meaning
- resource cost

Example:

```
Gateway ARP check
  Purpose: prove local L2 reachability
  Timeout: short
  Retries: bounded
  Result: reachable / failed / unknown
```

### E. Root-cause engine

Understand dependency order:

```
PHY
 ↓
L2
 ↓
IP
 ↓
route
 ↓
gateway
 ↓
DNS / Internet
 ↓
TLS/HTTPS
 ↓
VPN
 ↓
Firebase
 ↓
listener
 ↓
printer
```

The diagnosis engine must never report a higher-level symptom as the primary cause when a lower-level prerequisite is known to have failed.

### F. Firestore write behaviour

Study:
- write frequency
- cost
- document contention
- retries
- offline buffering
- timestamp semantics
- schema versioning
- security rules

The documented system warns against hot documents and describes append-only health history. Guardian should preserve that direction rather than turning one kiosk document into a high-frequency hot spot.

### G. Production rollout mechanics

Understand exactly how a listener is deployed today before adding a new agent. The structure includes multiple deployment/patch/recovery scripts; we need to separate current production path from historical repair tooling.

## 11. Proposed code boundaries

Do not mix Guardian code into the business listener initially.

Preferred first boundary:

```
pi-agent/
├── agent.py
├── collectors/
│   ├── identity.py
│   ├── network.py
│   ├── dns.py
│   ├── internet.py
│   ├── tailscale.py
│   ├── services.py
│   ├── printer.py
│   └── system.py
├── diagnosis/
│   ├── model.py
│   └── classifier.py
├── publisher/
│   └── firestore.py
├── config/
│   └── defaults.yaml
└── tests/
```

Exact placement may be adapted after inspecting the live repository. The architectural boundary matters more than the directory name.

## 12. Guardian health contract v1

A single snapshot should be conceptually shaped like:

```
HealthSnapshot
  schemaVersion
  kioskId
  observedAt
  agentVersion

  identity
  network
    ethernet[]
    wifi[]
    ipv4
    routes
    gateway
    dns
    internet
    tailscale

  services
    listener
    cups

  system
    uptime
    cpu
    memory
    disk
    temperature

  diagnosis
    overall
    rootCause
    cascades[]
    checks[]
```

Keep secrets out of the snapshot.

## 13. Definition of Done for v1

Guardian v1 is complete only when:

- existing print flow works with Guardian disabled
- existing print flow works with Guardian enabled
- Guardian crash does not stop printing
- network loss is classified correctly
- gateway ARP failure is classified correctly
- DNS failure is distinguished from Internet failure
- Tailscale failure is distinguished from Internet failure
- Firebase failure is distinguished from network failure
- listener/CUPS failure is distinguished from network failure
- health appears for both kiosks in the admin dashboard
- stale heartbeat is visually obvious
- no secrets are exposed
- resource usage remains bounded
- staging failure tests pass
- canary kiosk runs without regression
- rollback removes Guardian cleanly

## 14. First implementation milestone

Do not implement auto-repair yet.

Milestone A:

```
Observe -> classify -> publish -> visualize
```

Only after this is stable:

```
Observe -> classify -> recommend
```

Then eventually:

```
Observe -> classify -> controlled repair -> verify -> rollback if needed
```

## 15. Immediate next task

Before writing Guardian code, inspect the Tier A files and produce a verified map of:

1. current listener process
2. current systemd unit
3. current heartbeat writer
4. current Firestore health path
5. current network/fallback scripts
6. actual kiosk identity mechanism
7. current production deployment/update path

That verified map becomes the input to the Guardian implementation.
