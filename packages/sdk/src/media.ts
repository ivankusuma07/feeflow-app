/**
 * Public IPFS gateway for token logos. Pons logos load from it (checked 27 Nov 2026); ipfs.io and
 * dweb.link no longer serve files directly. Its host is allow-listed in apps/web/next.config.ts.
 */
export const IPFS_GATEWAY = "https://gateway.pinata.cloud/ipfs/";

// CIDv0 (base58btc "Qm…") or CIDv1 in base32 ("b…", e.g. "bafkrei…").
const CID = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{50,100})$/;
const PATH = /^[A-Za-z0-9._~-]+(\/[A-Za-z0-9._~-]+)*$/;

/**
 * Pons token logo (`logo()`, set at launch) as an https URL, or null. Only `ipfs://<cid>[/path]`
 * is accepted: the value is untrusted launcher input, so anything else (http URLs, data URIs,
 * odd characters) is dropped rather than rendered.
 */
export function ipfsImageUrl(
  uri: string | null | undefined,
  gateway = IPFS_GATEWAY,
): string | null {
  if (!uri) return null;
  const s = uri.trim();
  if (s.length > 300 || !s.toLowerCase().startsWith("ipfs://")) return null;
  let rest = s.slice("ipfs://".length);
  if (rest.startsWith("ipfs/")) rest = rest.slice("ipfs/".length);
  const [cid, ...path] = rest.split("/");
  if (!cid || !CID.test(cid)) return null;
  const p = path.join("/");
  if (p && (!PATH.test(p) || path.some((seg) => seg === "." || seg === ".."))) return null;
  return `${gateway}${cid}${p ? `/${p}` : ""}`;
}
