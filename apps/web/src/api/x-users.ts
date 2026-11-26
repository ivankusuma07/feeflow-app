import { UserFacingError } from "@feeflow/sdk";
import { z } from "zod";

/**
 * Handle → numeric id lookup through the VPS API's `/x/users` endpoint (brief: X API only for
 * handle→id at /route and never-logged-in ids, cached 24 h). FeeFlow binds fees to the id,
 * so the user confirms the account (name and avatar) before signing.
 */
export interface XUser {
  id: string;
  username: string;
  name: string;
  avatarUrl: string | null;
}

/** X handles: 1–15 letters, digits or underscores. A leading @ is accepted and stripped. */
export const X_HANDLE = /^@?([A-Za-z0-9_]{1,15})$/;

export function normalizeHandle(input: string): string | null {
  const m = X_HANDLE.exec(input.trim());
  return m ? m[1]! : null;
}

const userSchema = z.object({
  id: z.string().regex(/^[1-9]\d{0,19}$/),
  username: z.string().regex(/^[A-Za-z0-9_]{1,15}$/),
  name: z.string().max(100),
  avatarUrl: z
    .string()
    .url()
    .refine((u) => u.startsWith("https://"))
    .nullable()
    .optional(),
});

/** Largest uint64: the contract stores the id as uint64. */
const MAX_UINT64 = 2n ** 64n - 1n;

export async function lookupXUser(
  apiUrl: string | undefined,
  handle: string,
  fetchImpl: typeof fetch = fetch,
): Promise<XUser | null> {
  if (!apiUrl) throw new UserFacingError("The X account lookup is not set up yet.", false);
  const username = normalizeHandle(handle);
  if (!username) throw new UserFacingError("That is not a valid X handle.", false);

  let res: Response;
  try {
    res = await fetchImpl(
      `${apiUrl.replace(/\/$/, "")}/x/users?username=${encodeURIComponent(username)}`,
    );
  } catch {
    throw new UserFacingError("The X account lookup could not be reached. Try again.");
  }
  if (res.status === 404) return null;
  if (res.status === 429)
    throw new UserFacingError("Too many lookups. Wait a minute, then try again.");
  if (!res.ok) throw new UserFacingError("The X account lookup is unavailable. Try again.");

  const parsed = userSchema.safeParse(await res.json().catch(() => null));
  if (!parsed.success || BigInt(parsed.data.id) > MAX_UINT64) {
    throw new UserFacingError("The X account lookup sent an invalid reply. Try again.");
  }
  if (parsed.data.username.toLowerCase() !== username.toLowerCase()) {
    throw new UserFacingError("The X account lookup returned a different account. Try again.");
  }
  return { ...parsed.data, avatarUrl: parsed.data.avatarUrl ?? null };
}
