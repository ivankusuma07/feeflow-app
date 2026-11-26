"use client";

import { largeXAvatar } from "@feeflow/sdk";
import { useIdentityToken, usePrivy, useWallets } from "@privy-io/react-auth";
import { useMemo, type ReactNode } from "react";
import type { Address } from "viem";
import { AuthContext, type AuthState } from "./auth-context";

/** Maps Privy's hooks onto the app's `AuthState`. Must sit inside `PrivyProvider`. */
export function PrivyAuthBridge({ children }: { children: ReactNode }) {
  const { ready, authenticated, user, login, logout, connectWallet } = usePrivy();
  const { identityToken } = useIdentityToken();
  const { wallets } = useWallets();

  const value = useMemo<AuthState>(() => {
    const tw = user?.twitter;
    return {
      enabled: true,
      ready,
      authenticated,
      xAccount: tw
        ? {
            userId: tw.subject,
            username: tw.username,
            name: tw.name,
            avatarUrl: largeXAvatar(tw.profilePictureUrl),
          }
        : null,
      wallets: wallets.map((w) => ({
        address: w.address as Address,
        connectorType: w.connectorType,
        isEmbedded: w.walletClientType === "privy",
      })),
      login: () => login({ loginMethods: ["twitter"] }),
      logout,
      connectWallet: () => connectWallet(),
      getIdentityToken: async () => identityToken,
    };
  }, [ready, authenticated, user, wallets, identityToken, login, logout, connectWallet]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
