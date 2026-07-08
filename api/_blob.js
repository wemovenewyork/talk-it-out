// Vercel Blob upload helper. Not an HTTP handler. Requires BLOB_READ_WRITE_TOKEN
// (injected automatically once a Blob store is connected to the project).
import { put } from "@vercel/blob";

// Upload a base64 payload; returns the public blob URL.
export async function uploadBase64(key, base64, contentType) {
  if (!base64) return null;
  const buf = Buffer.from(base64, "base64");
  const { url } = await put(key, buf, {
    access: "public",
    contentType: contentType || "application/octet-stream",
    addRandomSuffix: true
  });
  return url;
}
