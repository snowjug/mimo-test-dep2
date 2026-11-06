const axios = require("axios");
const { admin, db } = require("../config/firebase");
const { sendWebsiteAlertEmail } = require("./email.service");

// Target customer website URL (defaults to production customer portal)
const CUSTOMER_WEBSITE_URL = process.env.CUSTOMER_WEBSITE_URL || "https://printmimo.tech";
const INCIDENT_COLLECTION = "customer_website_incidents";
const INCIDENT_LOOKBACK_MS = 30 * 60 * 1000; // Look back 30 minutes for customer disruptions

/**
 * Checks the real-time condition of the customer website.
 * Evaluates:
 * 1. Customer website frontend reachability & HTTP status
 * 2. Backend database connectivity
 * 3. Cloud storage availability
 * 4. Recent client error incidents logged by customer browsers
 *
 * @param {Object} options
 * @param {boolean} [options.skipProbe] Skip external HTTP probe (useful in tests/airgapped environments)
 * @param {boolean} [options.autoAlert] Automatically dispatch email alert if issue is found (default false to prevent polling email storms)
 */
async function checkCustomerWebsiteCondition({ skipProbe = false, autoAlert = false } = {}) {
  const now = Date.now();
  const checks = {
    frontend: { ok: true, message: "Reachable", status: 200 },
    database: { ok: true, message: "Connected" },
    storage: { ok: true, message: "Available" },
    clientTelemetry: { ok: true, activeIncidents: 0, latestIncident: null },
  };

  const detectedIssues = [];

  // 1. Probe customer website frontend (unless skipped or in test environment)
  if (!skipProbe && process.env.NODE_ENV !== "test") {
    try {
      const response = await axios.get(CUSTOMER_WEBSITE_URL, {
        timeout: 4500,
        validateStatus: () => true, // don't throw on 4xx/5xx so we inspect status cleanly
      });
      if (response.status >= 500) {
        checks.frontend = { ok: false, message: `HTTP ${response.status}`, status: response.status };
        detectedIssues.push({
          location: "Customer Web Host (printmimo.tech)",
          problem: `Website returned server error HTTP ${response.status}`,
          details: `The web server at ${CUSTOMER_WEBSITE_URL} returned HTTP ${response.status}. Customers cannot load the site properly.`,
          category: "SERVER_5XX_ERROR",
          route: "/",
        });
      } else {
        checks.frontend = { ok: true, message: `Responding (HTTP ${response.status})`, status: response.status };
      }
    } catch (netErr) {
      checks.frontend = { ok: false, message: netErr.message || "Network error", status: 0 };
      detectedIssues.push({
        location: "Customer Web Host (printmimo.tech)",
        problem: `Website unreachable (${netErr.code || netErr.message || "Connection timeout"})`,
        details: `Failed to connect to ${CUSTOMER_WEBSITE_URL}. Possible DNS failure, hosting outage, or connection timeout.`,
        category: "HOST_OUTAGE",
        route: "/",
      });
    }
  }

  // 2. Check Database connectivity
  try {
    if (typeof db.collection === "function") {
      await db.collection("system_status").limit(1).get();
      checks.database = { ok: true, message: "Firestore operational" };
    }
  } catch (dbErr) {
    checks.database = { ok: false, message: dbErr.message };
    detectedIssues.push({
      location: "Backend Database (Firestore)",
      problem: "Database query probe failed",
      details: dbErr.message || "Could not query Firestore database.",
      category: "DATABASE_OUTAGE",
      route: "/api",
    });
  }

  // 3. Check Storage configuration
  try {
    if (typeof admin.storage === "function" && admin.storage().bucket()) {
      checks.storage = { ok: true, message: "Cloud Storage ready" };
    } else {
      checks.storage = { ok: false, message: "Cloud Storage not initialized" };
      detectedIssues.push({
        location: "Cloud Storage",
        problem: "Storage service not initialized",
        details: "admin.storage() is unavailable. Customer uploads will fail.",
        category: "STORAGE_OUTAGE",
        route: "/upload",
      });
    }
  } catch (storageErr) {
    checks.storage = { ok: false, message: storageErr.message };
    detectedIssues.push({
      location: "Cloud Storage",
      problem: "Storage service error",
      details: storageErr.message || "Storage bucket inaccessible.",
      category: "STORAGE_OUTAGE",
      route: "/upload",
    });
  }

  // 4. Check client-reported incidents from customer browsers in the last 30 minutes
  // Filter for GENUINE technical issues only (ignore benign cancellations, reloads, wrong passwords)
  try {
    const since = new Date(now - INCIDENT_LOOKBACK_MS);
    const snap = await db.collection(INCIDENT_COLLECTION)
      .where("createdAt", ">=", since)
      .limit(20)
      .get()
      .catch(() => null);

    if (snap && !snap.empty) {
      const incidents = [];
      snap.forEach((d) => incidents.push({ id: d.id, ...d.data() }));
      const unresolved = incidents.filter(
        (inc) => inc.status === "unresolved" && inc.technical !== false && inc.status !== "ignored"
      );

      if (unresolved.length > 0) {
        unresolved.sort((a, b) => {
          const tA = a.createdAt && (a.createdAt.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt).getTime()) || 0;
          const tB = b.createdAt && (b.createdAt.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt).getTime()) || 0;
          return tB - tA;
        });

        const latest = unresolved[0];
        checks.clientTelemetry = {
          ok: false,
          activeIncidents: unresolved.length,
          latestIncident: {
            id: latest.id,
            type: latest.type,
            message: latest.message,
            route: latest.route,
            details: latest.details,
            category: latest.category || "FRONTEND_CODE_CRASH",
            createdAt: latest.createdAt,
          },
        };

        detectedIssues.push({
          location: latest.route ? `Customer Frontend (${latest.route})` : "Customer Web Frontend",
          problem: latest.message || "Customer experienced an error on the website",
          details: latest.details || `Customer technical error reported on route '${latest.route || "unknown"}'. Total recent reports: ${unresolved.length}`,
          category: latest.category || "FRONTEND_CODE_CRASH",
          route: latest.route || "/",
        });
      }
    }
  } catch (incErr) {
    console.warn("[WEBSITE-HEALTH] Incident scan skipped:", incErr.message);
  }

  const isGood = detectedIssues.length === 0;
  const primaryIssue = detectedIssues[0] || null;

  const result = {
    isGood,
    status: isGood ? "good" : "failing",
    problem: primaryIssue ? primaryIssue.problem : null,
    location: primaryIssue ? primaryIssue.location : null,
    details: primaryIssue ? primaryIssue.details : "All customer website systems (Web App, API, Cloud Storage) operational.",
    checkedAt: new Date(now).toISOString(),
    checks,
    detectedIssues,
  };

  // If issue detected and autoAlert is explicitly requested, dispatch alert email to MIMO mail address
  if (!isGood && autoAlert && primaryIssue) {
    try {
      await sendWebsiteAlertEmail({
        problem: primaryIssue.problem,
        location: primaryIssue.location,
        details: primaryIssue.details,
        category: primaryIssue.category || "TECHNICAL_FAULT",
        route: primaryIssue.route || "/",
      });
    } catch (err) {
      console.warn("[WEBSITE-HEALTH] Automated email alert failed:", err.message);
    }
  }

  return result;
}

module.exports = {
  checkCustomerWebsiteCondition,
  CUSTOMER_WEBSITE_URL,
  INCIDENT_COLLECTION,
};
