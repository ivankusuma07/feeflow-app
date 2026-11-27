import { UserFacingError } from "@feeflow/sdk";

/** Matches the API's limit (services/api/src/ipfs.ts). */
export const MAX_IMAGE_BYTES = 1024 * 1024;
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;

/**
 * Pins a token image on IPFS through the FeeFlow API (Pinata behind it) and returns its
 * `ipfs://` URI, which Pons stores as the token's `logo` at launch. The API checks the bytes.
 */
export async function uploadTokenImage(
  apiUrl: string | undefined,
  file: Blob,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  if (!apiUrl) throw new UserFacingError("Image upload is not set up yet.", false);
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type))
    throw new UserFacingError("Use a PNG, JPEG, GIF or WebP image.", false);
  if (file.size > MAX_IMAGE_BYTES) throw new UserFacingError("Images can be at most 1 MB.", false);

  let res: Response;
  try {
    res = await fetchImpl(`${apiUrl.replace(/\/$/, "")}/api/ipfs/image`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: file,
    });
  } catch {
    throw new UserFacingError("The image upload could not be reached. Try again.");
  }
  if (res.status === 400) throw new UserFacingError("Use a PNG, JPEG, GIF or WebP image.", false);
  if (res.status === 413) throw new UserFacingError("Images can be at most 1 MB.", false);
  if (res.status === 429)
    throw new UserFacingError("Too many uploads from this network. Try again later.");
  if (!res.ok) throw new UserFacingError("The image upload is unavailable. Try again.");
  const body = (await res.json().catch(() => null)) as { uri?: unknown } | null;
  const uri = typeof body?.uri === "string" ? body.uri : "";
  if (!/^ipfs:\/\/[A-Za-z0-9]{46,100}$/.test(uri))
    throw new UserFacingError("The image upload sent an invalid reply. Try again.");
  return uri;
}
