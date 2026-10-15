/**
 * Utilities for active print code expiration (24-hour validity window).
 * 
 * Print codes allocated after payment stay active for exactly 24 hours
 * before deactivating (auto-expiring), as enforced across the system.
 */

export const CODE_VALIDITY_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

export interface TimeLeftResult {
  /** User-facing countdown text (e.g. "Expires in 23h 45m", "Expires in 42m 10s", "Expires in 30s", "Code expired") */
  text: string;
  /** Short summary format (e.g. "23h 45m left", "42m left", "Expired") */
  shortText: string;
  /** Absolute expiration date/time string matching locale (e.g. "16 Oct, 8:18 PM") */
  validTillText: string;
  /** Absolute expiration timestamp in ms */
  expiresAt: number;
  /** Milliseconds remaining until expiration (clamped at >= 0) */
  remainingMs: number;
  /** Whether the code has passed the 24-hour window */
  isExpired: boolean;
  /** Urgency level for visual indicator styling */
  urgency: "normal" | "warning" | "critical";
  /** Remaining whole hours */
  hours: number;
  /** Remaining whole minutes */
  minutes: number;
  /** Remaining whole seconds */
  seconds: number;
}

/**
 * Safely extracts the creation timestamp in milliseconds from various formats
 * supported by Firestore, backend APIs, and local storage.
 */
export function getJobTimestamp(job: any): number {
  if (!job) return 0;

  // 1. Explicit numeric createdAtTime (ms)
  if (typeof job.createdAtTime === "number" && !isNaN(job.createdAtTime) && job.createdAtTime > 0) {
    return job.createdAtTime;
  }

  // 2. job.createdAt formats
  if (job.createdAt) {
    if (typeof job.createdAt === "number" && !isNaN(job.createdAt) && job.createdAt > 0) {
      return job.createdAt;
    }
    // Firestore Timestamp instance with toDate()
    if (typeof job.createdAt.toDate === "function") {
      try {
        const ms = job.createdAt.toDate().getTime();
        if (!isNaN(ms) && ms > 0) return ms;
      } catch {}
    }
    // Firestore Timestamp serialized object { seconds, nanoseconds }
    if (typeof job.createdAt.seconds === "number" && job.createdAt.seconds > 0) {
      return job.createdAt.seconds * 1000;
    }
    // ISO string or Date parseable
    const parsed = new Date(job.createdAt).getTime();
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }

  // 3. job.date formats
  if (job.date) {
    const parsed = new Date(job.date).getTime();
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return 0;
}

/**
 * Formats a Date into the standard MIMO format: e.g. "16 Oct, 8:18 PM".
 */
export function formatValidTillDate(date: Date): string {
  if (!(date instanceof Date) || isNaN(date.getTime())) return "";
  const day = date.getDate();
  const month = date.toLocaleString("en-US", { month: "short" });
  const time = date.toLocaleString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${day} ${month}, ${time}`;
}

/**
 * Calculates remaining time until deactivation and returns human-friendly
 * countdown strings, urgency levels, and exact validity timestamps.
 */
export function getTimeLeft(job: any, nowMs: number = Date.now()): TimeLeftResult {
  const jobTimestamp = getJobTimestamp(job);

  if (!jobTimestamp) {
    return {
      text: "Valid for 24h",
      shortText: "24h validity",
      validTillText: "",
      expiresAt: 0,
      remainingMs: CODE_VALIDITY_MS,
      isExpired: false,
      urgency: "normal",
      hours: 24,
      minutes: 0,
      seconds: 0,
    };
  }

  const expiresAt = jobTimestamp + CODE_VALIDITY_MS;
  const remainingMs = Math.max(0, expiresAt - nowMs);
  const isExpired = expiresAt <= nowMs;
  const validTillText = formatValidTillDate(new Date(expiresAt));

  if (isExpired) {
    return {
      text: "Code expired",
      shortText: "Expired",
      validTillText,
      expiresAt,
      remainingMs: 0,
      isExpired: true,
      urgency: "critical",
      hours: 0,
      minutes: 0,
      seconds: 0,
    };
  }

  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  let text = "";
  let shortText = "";
  let urgency: "normal" | "warning" | "critical" = "normal";

  if (hours >= 1) {
    text = `Expires in ${hours}h ${minutes}m`;
    shortText = `${hours}h ${minutes}m left`;
    urgency = hours < 2 ? "warning" : "normal";
  } else if (minutes >= 1) {
    text = `Expires in ${minutes}m ${seconds}s`;
    shortText = `${minutes}m ${seconds}s left`;
    urgency = "critical"; // Under 1 hour remaining is urgent
  } else {
    text = `Expires in ${seconds}s`;
    shortText = `${seconds}s left`;
    urgency = "critical";
  }

  return {
    text,
    shortText,
    validTillText,
    expiresAt,
    remainingMs,
    isExpired: false,
    urgency,
    hours,
    minutes,
    seconds,
  };
}

/**
 * Checks whether an unused print code is still active and valid (status 'paid',
 * unprinted, and within 24 hours of generation).
 */
export function isCodeActive(job: any, nowMs: number = Date.now()): boolean {
  if (!job) return false;
  if (job.status !== "paid") return false;
  if (!job.printCode || job.printCode === "-" || job.isPrinted === true) return false;

  const jobTimestamp = getJobTimestamp(job);
  if (!jobTimestamp) return false;

  const ageMs = nowMs - jobTimestamp;
  return ageMs >= 0 && ageMs <= CODE_VALIDITY_MS;
}
