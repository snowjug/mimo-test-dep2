const SESSION_ORDER_ID_KEY = "currentOrderId";
const SESSION_ORDER_JOB_IDS_KEY = "currentOrderJobIds";
const LOCAL_ORDER_ID_KEY = "mimo_currentOrderId";
const LOCAL_ORDER_JOB_IDS_KEY = "mimo_currentOrderJobIds";

/**
 * Returns a canonical, order-independent signature for a cart's jobIds.
 * Empty or invalid carts return "" so an uninitialized cart can never match a stored order binding.
 */
export function getCartJobSignature(filesList: unknown): string {
  if (!Array.isArray(filesList)) return "";

  const normalizedIds = Array.from(
    new Set(
      filesList
        .map((file: any) => (file?.jobId != null ? String(file.jobId).trim() : ""))
        .filter((id) => id.length > 0)
    )
  ).sort();

  return normalizedIds.length > 0 ? JSON.stringify(normalizedIds) : "";
}

/**
 * Binds an active checkout orderId to the normalized jobIds signature of the cart that created it.
 */
export function savePendingOrderBinding(orderId: string, filesList: unknown): void {
  const normalizedOrderId = String(orderId || "").trim();
  const jobSignature = getCartJobSignature(filesList);

  if (!normalizedOrderId || !jobSignature) {
    clearPendingOrderBinding();
    return;
  }

  sessionStorage.setItem(SESSION_ORDER_ID_KEY, normalizedOrderId);
  sessionStorage.setItem(SESSION_ORDER_JOB_IDS_KEY, jobSignature);
  localStorage.setItem(LOCAL_ORDER_ID_KEY, normalizedOrderId);
  localStorage.setItem(LOCAL_ORDER_JOB_IDS_KEY, jobSignature);
}

/**
 * Clears any pending orderId and cart-binding keys from both sessionStorage and localStorage.
 */
export function clearPendingOrderBinding(): void {
  sessionStorage.removeItem(SESSION_ORDER_ID_KEY);
  sessionStorage.removeItem(SESSION_ORDER_JOB_IDS_KEY);
  localStorage.removeItem(LOCAL_ORDER_ID_KEY);
  localStorage.removeItem(LOCAL_ORDER_JOB_IDS_KEY);
}

/**
 * Returns the pending orderId only if its stored jobIds signature matches `filesList`.
 * Checks sessionStorage as a strict (orderId, jobSignature) pair first, then falls back to
 * localStorage only when sessionStorage has no orderId and localStorage's bound signature
 * matches this cart's exact jobIds.
 */
export function getBoundPendingOrderId(filesList: unknown): string | null {
  const currentSignature = getCartJobSignature(filesList);
  if (!currentSignature) return null;

  const sessionOrderId = sessionStorage.getItem(SESSION_ORDER_ID_KEY);
  if (sessionOrderId) {
    const sessionJobSignature = sessionStorage.getItem(SESSION_ORDER_JOB_IDS_KEY);
    return sessionJobSignature === currentSignature ? sessionOrderId : null;
  }

  const localOrderId = localStorage.getItem(LOCAL_ORDER_ID_KEY);
  if (localOrderId) {
    const localJobSignature = localStorage.getItem(LOCAL_ORDER_JOB_IDS_KEY);
    return localJobSignature === currentSignature ? localOrderId : null;
  }

  return null;
}

