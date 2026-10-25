/**
 * MIMO Edge Guardian — plain-English translation for root-cause codes (Phase 2.4).
 *
 * guardian/classifier.py (Pi-side) only ever emits a root cause when it has valid negative
 * evidence (CLAUDE.md: "FAIL requires valid negative evidence... never FAIL" for a missing command,
 * timeout, permission error or malformed output). This is deliberately NOT a predictive model —
 * it never guesses at a future failure, only reports a currently-confirmed one — so every sentence
 * below describes something Guardian has already established, not something it expects to happen.
 *
 * Every code here is exhaustively listed in guardian/classifier.py's CHAIN_CODES, RESOURCE_CODES,
 * and its own add_root() call sites (DNS_FAILURE, ENDPOINT_UNREACHABLE, INTERNET_UNREACHABLE,
 * HTTPS_FAILURE, LISTENER_FAILURE, CUPS_FAILURE, TAILSCALE_FAILURE) — this file adds no code the
 * backend cannot actually send, and `rootCauseSentence`'s fallback never claims false confidence
 * about a code it doesn't recognise.
 */
import type { GuardianSeverity } from '../../types/guardian.types';

const SENTENCES: Record<string, string> = {
  // Connectivity chain (guardian/classifier.py's CHAIN_CODES) — lowest failed layer is the root
  // cause; layers above it are reported as cascades, not repeated here.
  LINK_DOWN: 'No network link — check the Ethernet/Wi-Fi cable or adapter.',
  NO_IPV4: 'No IPv4 address assigned — likely a DHCP or network configuration problem.',
  INVALID_ROUTE: 'No usable default route — the kiosk has an address but no way out to the network.',
  GATEWAY_UNREACHABLE: "Network is up but the router isn't responding — check the local router/switch.",
  DNS_FAILURE: "DNS lookups are failing — the kiosk can't resolve hostnames.",
  ENDPOINT_UNREACHABLE: "Can't reach the MIMO backend from this kiosk, though the network itself looks fine.",
  INTERNET_UNREACHABLE: 'No internet reachable from this kiosk at all — likely an ISP or router outage.',
  HTTPS_FAILURE: 'Reached the backend, but the secure connection failed — a TLS/certificate problem.',
  // Services plane
  LISTENER_FAILURE: "The MIMO print listener service is down — prints won't process until it restarts.",
  CUPS_FAILURE: "The print spooler (CUPS) isn't running — jobs will queue but not print.",
  // Management plane
  TAILSCALE_FAILURE: 'Tailscale (remote management) is down — this does not affect printing.',
  // Resources plane
  DISK_LOW: 'Disk space is running low on this kiosk.',
  MEMORY_LOW: 'Memory is running low on this kiosk.',
  TEMPERATURE_HIGH: 'This kiosk is running hot.',
};

/** A one-line, human-readable explanation of a root-cause code, or a generic-but-honest fallback
 * for a code this file doesn't recognise yet (never silently blank, never a guess at specifics). */
export function rootCauseSentence(code: string): string {
  return SENTENCES[code] ?? `Guardian reported a fault (${code}).`;
}

export const ROOT_CAUSE_SEVERITY_TONE: Record<GuardianSeverity, 'rose' | 'amber'> = {
  CRITICAL: 'rose',
  MANAGEMENT: 'amber',
  WARNING: 'amber',
};
