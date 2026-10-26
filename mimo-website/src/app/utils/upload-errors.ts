// Plain-language messages for failed uploads. The server already explains most failures precisely (which file could not
// be converted, a file that is too large, a link dragged in instead of a file), but the upload page used to show only a
// generic "Upload failed". These helpers surface that explanation, and name the files that failed.

type ErrorLike = { response?: { status?: number; data?: { error?: unknown } } };

/** What to tell the customer when a request in the upload flow fails. */
export function describeUploadFailure(err: unknown): string {
  const e = (err ?? null) as ErrorLike | null;
  const serverMessage = e?.response?.data?.error;
  if (typeof serverMessage === "string" && serverMessage.trim()) return serverMessage.trim();
  if (e?.response?.status === 401) return "Your session has expired. Please log in again.";
  if (e?.response?.status === 413) return "That file is too large to upload.";
  if (e && !e.response) return "Couldn't reach MIMO. Check your internet connection and try again.";
  return "Upload failed. Please try again.";
}

/** Toast text for files whose upload to storage failed, naming the first one when several failed. */
export function failedFilesMessage(names: string[]): string {
  if (names.length === 0) return "Upload failed. Please try again.";
  if (names.length === 1) return `Couldn't upload "${names[0]}". Please try again.`;
  return `Couldn't upload "${names[0]}" and ${names.length - 1} more. Please try again.`;
}
