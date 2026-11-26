"use client";

import { createContext, useContext } from "react";
import type { Address } from "viem";

/** The X account behind a Privy login. `userId` (X's numeric id) is the key; handles are display data. */
export interface XAccount {
  userId: string;
  username: string | null;
  name: string | null;
  /** 400 px variant of the X avatar, or null. */
  avatarUrl: string | null;
}

export interface WalletInfo {
  address: Address;
  /** "privy" for the embedded wallet, otherwise the external connector (e.g. "injected"). */
  connectorType: string;
  isEmbedded: boolean;
}

/**
 * App-facing auth contract (brief Stage 2). Pages depend on this, never on Privy directly, so
 * tests and Playwright can provide a mock implementation.
 */
export interface AuthState {
  /** False when no Privy app id is configured: login buttons explain instead of opening a modal. */
  enabled: boolean;
  /** Privy has finished restoring the session. Render skeletons until true. */
  ready: boolean;
  authenticated: boolean;
  /** Set only when the user logged in with X. A wallet-only session has no X account. */
  xAccount: XAccount | null;
  wallets: WalletInfo[];
  login: () => void;
  logout: () => Promise<void>;
  /** Opens the wallet picker (external wallets via Privy connectors). */
  connectWallet: () => void;
  /** Privy identity token for the attestation API; it verifies the token server-side. */
  getIdentityToken: () => Promise<string | null>;
}

export const DISABLED_AUTH: AuthState = {
  enabled: false,
  ready: true,
  authenticated: false,
  xAccount: null,
  wallets: [],
  login: () => {},
  logout: async () => {},
  connectWallet: () => {},
  getIdentityToken: async () => null,
};

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AppProviders>");
  return ctx;
}
