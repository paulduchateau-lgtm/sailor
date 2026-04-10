// ── Vercel Blob adapter ─────────────────────────────────────────────────────
// Persistent storage for original uploaded files.
//
// Activates automatically when BLOB_READ_WRITE_TOKEN is set (injected by Vercel
// when a Blob store is linked to the project). In local dev without the token,
// all operations are no-ops and the rest of the pipeline continues to rely on
// the local filesystem (UPLOADS_DIR).

import fs from "fs";

let _sdk = null;

async function getSdk() {
  if (_sdk) return _sdk;
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  try {
    _sdk = await import("@vercel/blob");
    return _sdk;
  } catch (err) {
    console.warn("Vercel Blob SDK not installed:", err.message);
    return null;
  }
}

export function blobEnabled() {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

/**
 * Upload a file buffer or on-disk file to Vercel Blob.
 * Returns the public URL, or null if blob storage is disabled.
 */
export async function blobPutFile(key, filePathOrBuffer, contentType) {
  const sdk = await getSdk();
  if (!sdk) return null;
  const body = Buffer.isBuffer(filePathOrBuffer)
    ? filePathOrBuffer
    : fs.readFileSync(filePathOrBuffer);
  try {
    const result = await sdk.put(key, body, {
      access: "public",
      contentType: contentType || "application/octet-stream",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return result.url;
  } catch (err) {
    console.error("Blob upload failed:", err.message);
    return null;
  }
}

/**
 * Delete a single blob by URL.
 */
export async function blobDelete(url) {
  const sdk = await getSdk();
  if (!sdk || !url) return;
  try {
    await sdk.del(url);
  } catch (err) {
    console.error("Blob delete failed:", err.message);
  }
}

/**
 * Delete all blobs under a workspace prefix.
 */
export async function blobDeleteWorkspace(workspaceId) {
  const sdk = await getSdk();
  if (!sdk) return;
  try {
    const prefix = `sailor/${workspaceId}/`;
    let cursor;
    do {
      const page = await sdk.list({ prefix, cursor });
      if (page.blobs && page.blobs.length > 0) {
        await sdk.del(page.blobs.map(b => b.url));
      }
      cursor = page.cursor;
    } while (cursor);
  } catch (err) {
    console.error("Blob workspace cleanup failed:", err.message);
  }
}

/**
 * Build a stable key for a document blob.
 */
export function blobKey(workspaceId, docId, ext) {
  const safeExt = (ext || "bin").replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  return `sailor/${workspaceId}/${docId}.${safeExt}`;
}
