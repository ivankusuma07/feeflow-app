import { z } from "zod";

/** Display data for an X account. The numeric id is the key; the rest is cached display data. */
export interface XUser {
  id: string;
  username: string;
  name: string;
  avatarUrl: string | null;
}

export interface XClient {
  byUsername(username: string): Promise<XUser | null>;
  byId(id: string): Promise<XUser | null>;
}

export class XUnavailableError extends Error {
  override name = "XUnavailableError";
}

const userSchema = z.object({
  id: z.string().regex(/^[1-9]\d{0,19}$/),
  username: z.string().regex(/^[A-Za-z0-9_]{1,15}$/),
  name: z.string(),
  profile_image_url: z.string().optional(),
});
const responseSchema = z.object({ data: userSchema.optional() });

const FOUND_TTL_MS = 24 * 60 * 60 * 1000;
const MISSING_TTL_MS = 60 * 60 * 1000;
const MAX_ENTRIES = 10_000;

/** X serves `_normal` (48 px) avatars by default; `_400x400` is the same image, larger. */
export function largeAvatar(url: string | undefined): string | null {
  if (!url || !url.startsWith("https://")) return null;
  return url.replace(/_normal(\.\w+)$/, "_400x400$1");
}

/**
 * X API v2 client (pay-per-use): one call per uncached lookup, results cached 24 h (misses 1 h),
 * so repeated /route lookups and register attestations don't spend credits.
 */
export function createXClient(
  bearer: string,
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now,
): XClient {
  const cache = new Map<string, { at: number; user: XUser | null }>();

  async function lookup(key: string, path: string): Promise<XUser | null> {
    const hit = cache.get(key);
    if (hit && now() - hit.at < (hit.user ? FOUND_TTL_MS : MISSING_TTL_MS)) return hit.user;

    let res: Response;
    try {
      res = await fetchImpl(`https://api.x.com/2/${path}?user.fields=profile_image_url`, {
        headers: { authorization: `Bearer ${bearer}` },
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new XUnavailableError("X API unreachable");
    }
    let user: XUser | null;
    if (res.status === 404 || res.status === 400) {
      user = null;
    } else if (!res.ok) {
      throw new XUnavailableError(`X API returned ${res.status}`);
    } else {
      const body = responseSchema.safeParse(await res.json().catch(() => null));
      if (!body.success) throw new XUnavailableError("X API sent an unexpected reply");
      // X answers 200 with `errors` and no `data` for unknown or suspended accounts.
      const d = body.data.data;
      user = d
        ? {
            id: d.id,
            username: d.username,
            name: d.name,
            avatarUrl: largeAvatar(d.profile_image_url),
          }
        : null;
    }
    if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: now(), user });
    if (user) {
      cache.set(`id:${user.id}`, { at: now(), user });
      cache.set(`u:${user.username.toLowerCase()}`, { at: now(), user });
    }
    return user;
  }

  return {
    byUsername: (username) =>
      lookup(`u:${username.toLowerCase()}`, `users/by/username/${encodeURIComponent(username)}`),
    byId: (id) => lookup(`id:${id}`, `users/${encodeURIComponent(id)}`),
  };
}
