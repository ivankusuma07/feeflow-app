import { ipfsImageUrl } from "@feeflow/sdk";

/**
 * Token images for the Launch page. Pons stores a launch's `logo` as an `ipfs://` URI forever, so
 * the image is pinned once, through Pinata's v3 upload API (docs.pinata.cloud, checked 28 Nov 2026):
 * `POST https://uploads.pinata.cloud/v3/files`, Bearer JWT with `org:files:write`, multipart
 * `file` + `network=public`, CIDv1 at `data.cid`.
 */
export const PINATA_UPLOAD_URL = "https://uploads.pinata.cloud/v3/files";
/** Pons allows a 512-byte logo URI; the image itself is kept small for every page that shows it. */
export const MAX_IMAGE_BYTES = 1024 * 1024;

export type ImageType = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

/**
 * The image type from its first bytes, never from the declared content type. SVG is refused: it
 * can carry script, and gateways serve it as-is.
 */
export function sniffImage(b: Uint8Array): ImageType | null {
  const at = (i: number, ...xs: number[]) => xs.every((x, k) => b[i + k] === x);
  if (b.length >= 8 && at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (b.length >= 3 && at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (
    b.length >= 6 &&
    (at(0, 0x47, 0x49, 0x46, 0x38, 0x37, 0x61) || at(0, 0x47, 0x49, 0x46, 0x38, 0x39, 0x61))
  )
    return "image/gif";
  if (b.length >= 12 && at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50))
    return "image/webp";
  return null;
}

export interface ImagePinner {
  /** Pins the image publicly; returns its `ipfs://<cid>` URI. */
  pin(bytes: Uint8Array, type: ImageType): Promise<string>;
}

export class PinUnavailableError extends Error {}

export function createPinataPinner(jwt: string, fetchImpl: typeof fetch = fetch): ImagePinner {
  return {
    async pin(bytes, type) {
      const ext = type.split("/")[1];
      const form = new FormData();
      form.append("file", new Blob([bytes.slice().buffer], { type }), `token-image.${ext}`);
      form.append("network", "public");
      form.append("name", `feeflow-token-image.${ext}`);
      const res = await fetchImpl(PINATA_UPLOAD_URL, {
        method: "POST",
        headers: { authorization: `Bearer ${jwt}` },
        body: form,
        signal: AbortSignal.timeout(30_000),
      }).catch(() => null);
      if (!res?.ok)
        throw new PinUnavailableError(`pinata upload failed: ${res?.status ?? "network"}`);
      const body = (await res.json().catch(() => null)) as { data?: { cid?: unknown } } | null;
      const uri = `ipfs://${String(body?.data?.cid ?? "")}`;
      // Only a CID the app itself will render is handed out (CIDv1 base32 / CIDv0).
      if (!ipfsImageUrl(uri)) throw new PinUnavailableError("pinata returned no usable cid");
      return uri;
    },
  };
}
