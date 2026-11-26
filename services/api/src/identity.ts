import { PrivyClient } from "@privy-io/node";

/** The X account a verified Privy session controls. */
export interface VerifiedX {
  xUserId: string;
  username: string | null;
}

export interface IdentityVerifier {
  /** Null when the token is invalid, expired, or has no linked X account. */
  verify(identityToken: string): Promise<VerifiedX | null>;
}

/**
 * Verifies a Privy identity token (signature, issuer, audience = app id, expiry) and reads the
 * linked X account's `subject`. The X id always comes from here, never from the request body.
 */
export function privyVerifier(appId: string, appSecret: string): IdentityVerifier {
  const privy = new PrivyClient({ appId, appSecret });
  return {
    async verify(identityToken) {
      try {
        const user = await privy.users().get({ id_token: identityToken });
        const x = user.linked_accounts.find((a) => a.type === "twitter_oauth");
        if (!x || !("subject" in x) || !/^[1-9]\d{0,19}$/.test(x.subject)) return null;
        return { xUserId: x.subject, username: "username" in x ? (x.username ?? null) : null };
      } catch {
        return null;
      }
    },
  };
}
