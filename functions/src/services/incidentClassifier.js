"use strict";

/**
 * incidentClassifier.js
 *
 * Classifies customer website incidents and errors to ensure the developer team
 * only receives email notifications for genuine technical issues (frontend crashes,
 * backend 5xx errors, database outages, cloud storage failures), and NEVER for
 * routine customer mistakes, wrong passwords, page reloads, cancellations, or
 * client-side network disconnects.
 */

// Regex patterns for benign user/client mistakes (NEVER trigger alert emails)
const AUTH_CREDENTIAL_PATTERNS = [
  /wrong[-_\s]*password/i,
  /invalid[-_\s]*password/i,
  /incorrect[-_\s]*password/i,
  /password[-_\s]*missing/i,
  /auth\/wrong-password/i,
  /auth\/invalid-credential/i,
  /auth\/user-not-found/i,
  /invalid.*password/i,
  /user[-_\s]*not[-_\s]*found/i,
  /no[-_\s]*account[-_\s]*found/i,
  /user[-_\s]*already[-_\s]*exists/i,
  /use[-_\s]*google[-_\s]*login/i,
  /token[-_\s]*missing/i,
  /session.*expired/i,
  /token.*expired/i,
  /jwt.*expired/i,
  /jwt[-_\s]*malformed/i,
  /unauthorized/i,
  /invalid[-_\s]*credentials?/i,
  /invalid[-_\s]*otp/i,
  /wrong[-_\s]*otp/i,
  /login[-_\s]*failed/i,
  /please\s*log\s*in/i,
];

const LIFECYCLE_OR_CANCEL_PATTERNS = [
  /request[-_\s]*aborted/i,
  /aborterror/i,
  /cancelederror/i,
  /upload[-_\s]*cancell?ed/i,
  /user[-_\s]*cancell?ed/i,
  /beforeunload/i,
  /window[-_\s]*unload/i,
  /page[-_\s]*reloaded?/i,
  /page[-_\s]*refresh(ed)?/i,
  /navigation/i,
  /interrupted[-_\s]*by[-_\s]*user/i,
  /user[-_\s]*navigated/i,
];

const CLIENT_OFFLINE_PATTERNS = [
  /couldn'?t\s*reach\s*mimo/i,
  /check\s*your\s*internet\s*connection/i,
  /network[-_\s]*error/i,
  /failed\s*to\s*fetch/i,
  /err_internet_disconnected/i,
  /err_network_changed/i,
  /err_connection_reset/i,
  /err_name_not_resolved/i,
  /client[-_\s]*offline/i,
  /navigator\.offline/i,
  /net::err_/i,
];

const USER_INPUT_PATTERNS = [
  /invalid[-_\s]*promo/i,
  /promo[-_\s]*code/i,
  /coupon[-_\s]*expired/i,
  /coupon[-_\s]*not[-_\s]*found/i,
  /invalid[-_\s]*coupon/i,
  /file[-_\s]*is[-_\s]*too[-_\s]*large/i,
  /that[-_\s]*file[-_\s]*is[-_\s]*too[-_\s]*large/i,
  /unsupported[-_\s]*file[-_\s]*type/i,
  /doesn'?t\s*look\s*like\s*a\s*real\s*document/i,
  /password-protected\s*pdf/i,
  /encrypted\s*pdf/i,
  /empty\s*file/i,
];

// Regex patterns for genuine technical issues (MUST trigger developer alert emails)
const FRONTEND_CRASH_PATTERNS = [
  /render_crash/i,
  /minified\s*react\s*error/i,
  /typeerror:/i,
  /referenceerror:/i,
  /syntaxerror:/i,
  /rangeerror:/i,
  /cannot\s*read\s*propert(y|ies)\s*of/i,
  /is\s*not\s*a\s*function/i,
  /is\s*not\s*defined/i,
  /chunkloaderror/i,
  /loading\s*chunk\s*failed/i,
  /uncaught\s*render\s*error/i,
];

const SERVER_5XX_PATTERNS = [
  /status\s*code\s*50[0-4]/i,
  /http\s*50[0-4]/i,
  /internal\s*server\s*error/i,
  /bad\s*gateway/i,
  /service\s*unavailable/i,
  /gateway\s*timeout/i,
];

const INFRASTRUCTURE_OUTAGE_PATTERNS = [
  /database\s*query\s*probe\s*failed/i,
  /firestore/i,
  /deadline_exceeded/i,
  /resource_exhausted/i,
  /storage\s*service\s*(error|not\s*initialized)/i,
  /bucket\s*inaccessible/i,
  /cloud\s*storage/i,
  /website\s*unreachable/i,
  /website\s*returned\s*server\s*error/i,
];

/**
 * Classifies an incident into a technical issue vs benign user action.
 *
 * @param {Object} incident
 * @param {string} [incident.type]
 * @param {string} [incident.message]
 * @param {string} [incident.details]
 * @param {string} [incident.route]
 * @param {number|string} [incident.status]
 * @returns {{
 *   isTechnical: boolean,
 *   category: string,
 *   reason: string,
 *   severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
 * }}
 */
function classifyIncident({ type = "", message = "", details = "", route = "", status = 0 } = {}) {
  const typeStr = String(type || "").trim();
  const msgStr = String(message || "").trim();
  const detailsStr = String(details || "").trim();
  const combined = `${typeStr} ${msgStr} ${detailsStr}`;
  const statusCode = Number(status || 0);

  // 1. Check HTTP Status code if explicitly provided
  if (statusCode >= 400 && statusCode < 500) {
    if (statusCode === 401 || statusCode === 403) {
      return {
        isTechnical: false,
        category: "AUTH_USER_CREDENTIAL",
        reason: `Authentication failure (HTTP ${statusCode}). Customer session expired or unauthorized.`,
        severity: "LOW",
      };
    }
    return {
      isTechnical: false,
      category: "USER_INPUT_VALIDATION",
      reason: `Client validation error (HTTP ${statusCode}). Invalid customer request or payload.`,
      severity: "LOW",
    };
  }

  if (statusCode >= 500) {
    return {
      isTechnical: true,
      category: "SERVER_5XX_ERROR",
      reason: `Backend service responded with HTTP ${statusCode} server error.`,
      severity: "HIGH",
    };
  }

  // 2. Check for explicit Benign / User Mistakes first
  if (AUTH_CREDENTIAL_PATTERNS.some((re) => re.test(combined))) {
    return {
      isTechnical: false,
      category: "AUTH_USER_CREDENTIAL",
      reason: "Customer entered incorrect credentials, wrong password, or session expired.",
      severity: "LOW",
    };
  }

  if (LIFECYCLE_OR_CANCEL_PATTERNS.some((re) => re.test(combined))) {
    return {
      isTechnical: false,
      category: "PAGE_LIFECYCLE_OR_CANCEL",
      reason: "User cancelled upload, refreshed the page, or navigated away.",
      severity: "LOW",
    };
  }

  if (CLIENT_OFFLINE_PATTERNS.some((re) => re.test(combined))) {
    return {
      isTechnical: false,
      category: "CLIENT_LOCAL_OFFLINE",
      reason: "Customer device lost network connectivity or client-side fetch failed.",
      severity: "LOW",
    };
  }

  if (USER_INPUT_PATTERNS.some((re) => re.test(combined))) {
    return {
      isTechnical: false,
      category: "USER_INPUT_VALIDATION",
      reason: "Customer input error (file size exceeded, invalid promo code, or bad document).",
      severity: "LOW",
    };
  }

  // 3. Check for Genuine Technical Outages & Crashes
  if (FRONTEND_CRASH_PATTERNS.some((re) => re.test(combined))) {
    return {
      isTechnical: true,
      category: "FRONTEND_CODE_CRASH",
      reason: "Uncaught React component render crash or unhandled JavaScript runtime error.",
      severity: "HIGH",
    };
  }

  if (SERVER_5XX_PATTERNS.some((re) => re.test(combined))) {
    return {
      isTechnical: true,
      category: "SERVER_5XX_ERROR",
      reason: "Backend service returned HTTP 5xx error or internal conversion failure.",
      severity: "HIGH",
    };
  }

  if (INFRASTRUCTURE_OUTAGE_PATTERNS.some((re) => re.test(combined))) {
    return {
      isTechnical: true,
      category: "INFRASTRUCTURE_OUTAGE",
      reason: "Cloud Firestore, Cloud Storage, or Web Host infrastructure disruption.",
      severity: "CRITICAL",
    };
  }

  // 4. Default: If not matching a confirmed technical error, treat as benign client error
  // to avoid spamming developers with unverified notifications.
  return {
    isTechnical: false,
    category: "UNCONFIRMED_CLIENT_NOTICE",
    reason: "Unverified client event without detected technical crash or 5xx code.",
    severity: "LOW",
  };
}

module.exports = {
  classifyIncident,
  AUTH_CREDENTIAL_PATTERNS,
  LIFECYCLE_OR_CANCEL_PATTERNS,
  CLIENT_OFFLINE_PATTERNS,
  USER_INPUT_PATTERNS,
  FRONTEND_CRASH_PATTERNS,
  SERVER_5XX_PATTERNS,
  INFRASTRUCTURE_OUTAGE_PATTERNS,
};
