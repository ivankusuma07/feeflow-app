"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { AuthContext, type AuthState, type XAccount } from "./auth-context";

/**
 * DEVELOPMENT-ONLY stand-in for Privy ("mock Privy" in the brief), used for local work and
 * Playwright. Active only with `NEXT_PUBLIC_DATA_SOURCE=mock` and no Privy app id; the mock
 * data source is rejected in production builds, so this can never run in production.
 * Login is a local toggle as the designs' sample account; the wallet is wagmi's mock connector.
 */
export const MOCK_X_ACCOUNT: XAccount = {
  userId: "1000000000",
  username: "example_one",
  name: "Example One",
  avatarUrl: null,
};

/** Anvil account 0: a well-known public test address, never a real user's wallet. */
export const MOCK_WALLET = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;

export function MockAuthProvider({ children }: { children: ReactNode }) {
  const [loggedIn, setLoggedIn] = useState(true);
  const { address } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  const value = useMemo<AuthState>(
    () => ({
      enabled: true,
      ready: true,
      authenticated: loggedIn,
      xAccount: loggedIn ? MOCK_X_ACCOUNT : null,
      wallets: address ? [{ address, connectorType: "mock", isEmbedded: false }] : [],
      login: () => setLoggedIn(true),
      logout: async () => {
        disconnect();
        setLoggedIn(false);
      },
      connectWallet: () => {
        const c = connectors[0];
        if (c) connect({ connector: c });
      },
      getIdentityToken: async () => (loggedIn ? "mock-identity-token" : null),
    }),
    [loggedIn, address, connect, connectors, disconnect],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
