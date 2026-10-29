/**
 * Media URL utility for screensaver and public kiosk assets.
 * 
 * Ensures media URLs stream properly on kiosk devices:
 * 1. Google Cloud Storage raw URLs (https://storage.googleapis.com/<bucket>/<path>)
 *    are rewritten to public Firebase Storage URLs
 *    (https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<path>?alt=media)
 *    because Firebase Storage security rules grant public read to /screensaver/** and /ads/**,
 *    whereas direct storage.googleapis.com requests require Google Cloud IAM credentials and
 *    fail with 403 Forbidden on anonymous kiosk browsers.
 * 
 * 2. Google Drive share/view links (https://drive.google.com/file/d/<id>/...)
 *    are rewritten to direct stream/download endpoints (https://drive.google.com/uc?export=download&id=<id>).
 */

function normalizeMediaUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';

  // Google Cloud Storage -> Firebase Storage
  const gcsMatch = trimmed.match(/^https:\/\/storage\.googleapis\.com\/([^/]+)\/(.+)$/);
  if (gcsMatch) {
    const bucket = gcsMatch[1];
    const objectPath = decodeURIComponent(gcsMatch[2]);
    return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(objectPath)}?alt=media`;
  }

  // Google Drive link -> Direct stream link
  const driveMatch = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (driveMatch) {
    const fileId = driveMatch[1];
    return `https://drive.google.com/uc?export=download&id=${fileId}`;
  }

  return trimmed;
}

module.exports = {
  normalizeMediaUrl
};
