import type { XProfile } from "./views";

/**
 * X display data for the accounts in a response. Brief §X API client: the numeric id is the key,
 * handles and avatars are cached display data refreshed weekly, looked up with the batched
 * `GET /2/users?ids=` (≤ 100 ids per call). A failed lookup never fails the response: accounts
 * without cached data are served by id only.
 */
export interface XProfiles {
  get(ids: string[]): Promise<Map<string, XProfile>>;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** After a failed call, wait before spending credits on the same ids again. */
const RETRY_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 20_000;
const ID = /^[1-9]\d{0,19}$/;

interface UserJson {
  id?: unknown;
  username?: unknown;
  name?: unknown;
  profile_image_url?: unknown;
}

function largeAvatar(url: unknown): string | null {
  if (typeof url !== "string" || !url.startsWith("https://")) return null;
  return url.replace(/_normal(\.\w+)$/, "_400x400$1");
}

export const noXProfiles: XProfiles = { get: async () => new Map() };

export function createXProfiles(
  bearer: string,
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now,
): XProfiles {
  const cache = new Map<string, { at: number; ttl: number; profile: XProfile | null }>();
  const put = (id: string, profile: XProfile | null, ttl: number) => {
    if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value!);
    cache.set(id, { at: now(), ttl, profile });
  };

  async function fetchBatch(ids: string[]) {
    try {
      const res = await fetchImpl(
        `https://api.x.com/2/users?ids=${ids.join(",")}&user.fields=profile_image_url`,
        { headers: { authorization: `Bearer ${bearer}` }, signal: AbortSignal.timeout(8000) },
      );
      if (!res.ok) throw new Error(`X API returned ${res.status}`);
      const body = (await res.json()) as { data?: UserJson[] };
      const found = new Set<string>();
      for (const u of body.data ?? []) {
        if (typeof u.id !== "string" || typeof u.username !== "string") continue;
        found.add(u.id);
        put(
          u.id,
          {
            username: u.username,
            name: typeof u.name === "string" ? u.name : u.username,
            avatarUrl: largeAvatar(u.profile_image_url),
          },
          WEEK_MS,
        );
      }
      // Suspended or deleted accounts come back in `errors`; remember them for a week too.
      for (const id of ids) if (!found.has(id)) put(id, null, WEEK_MS);
    } catch {
      // Keep serving what we had; retry these ids later rather than on every request.
      for (const id of ids) put(id, cache.get(id)?.profile ?? null, RETRY_MS);
    }
  }

  return {
    async get(ids) {
      const unique = [...new Set(ids)].filter((id) => ID.test(id));
      const stale = unique.filter((id) => {
        const hit = cache.get(id);
        return !hit || now() - hit.at >= hit.ttl;
      });
      for (let i = 0; i < stale.length; i += 100) await fetchBatch(stale.slice(i, i + 100));
      const out = new Map<string, XProfile>();
      for (const id of unique) {
        const p = cache.get(id)?.profile;
        if (p) out.set(id, p);
      }
      return out;
    },
  };
}
