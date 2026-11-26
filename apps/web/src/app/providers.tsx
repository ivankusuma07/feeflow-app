"use client";

import { Toaster } from "@feeflow/ui";
import { PrivyProvider, type PrivyClientConfig } from "@privy-io/react-auth";
import {
  WagmiProvider as PrivyWagmiProvider,
  createConfig as createPrivyWagmiConfig,
} from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { http } from "viem";
import { WagmiProvider, createConfig } from "wagmi";
import { mock } from "wagmi/connectors";
import { AuthContext, DISABLED_AUTH } from "@/auth/auth-context";
import { MOCK_WALLET, MockAuthProvider } from "@/auth/mock-auth";
import { PrivyAuthBridge } from "@/auth/privy-auth";
import { DataSourceProvider } from "@/data/context";
import { appChain, rpcUrl } from "@/lib/chain";
import { env } from "@/lib/config";

const transports = { [appChain.id]: http(rpcUrl ?? undefined) } as const;

const privyConfig: PrivyClientConfig = {
  loginMethods: ["twitter", "wallet"],
  appearance: { theme: "light", accentColor: "#CCFF00", walletChainType: "ethereum-only" },
  embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
  defaultChain: appChain,
  supportedChains: [appChain],
};

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
    },
  });
}

/**
 * Client providers for the app routes only (the landing page ships without them).
 * With a Privy app id: Privy → React Query → Privy's wagmi adapter → auth bridge.
 * Without one (local dev, CI builds): plain wagmi and a disabled auth state, so pages still render.
 * Without one and with the mock data source or NEXT_PUBLIC_MOCK_AUTH=1 (dev and Playwright only;
 * both rejected in production):
 * the mock login and wagmi's mock wallet connector, so logged-in pages can be developed.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(makeQueryClient);
  const appId = env.NEXT_PUBLIC_PRIVY_APP_ID;

  const inner = (
    <DataSourceProvider>
      {children}
      <Toaster />
    </DataSourceProvider>
  );

  if (!appId && mockAuthEnabled) {
    return (
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={mockWagmiConfig}>
          <MockAuthProvider>{inner}</MockAuthProvider>
        </WagmiProvider>
      </QueryClientProvider>
    );
  }

  if (!appId) {
    return (
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={plainWagmiConfig}>
          <AuthContext.Provider value={DISABLED_AUTH}>{inner}</AuthContext.Provider>
        </WagmiProvider>
      </QueryClientProvider>
    );
  }

  return (
    <PrivyProvider appId={appId} config={privyConfig}>
      <QueryClientProvider client={queryClient}>
        <PrivyWagmiProvider config={privyWagmiConfig}>
          <PrivyAuthBridge>{inner}</PrivyAuthBridge>
        </PrivyWagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}

const privyWagmiConfig = createPrivyWagmiConfig({ chains: [appChain], transports, ssr: true });
const plainWagmiConfig = createConfig({ chains: [appChain], transports, ssr: true });

// Dev and Playwright only: parsePublicEnv rejects both switches in production builds.
const mockAuthEnabled = env.NEXT_PUBLIC_DATA_SOURCE === "mock" || env.NEXT_PUBLIC_MOCK_AUTH === "1";
const mockWagmiConfig = createConfig({
  chains: [appChain],
  transports,
  connectors: [mock({ accounts: [MOCK_WALLET] })],
  ssr: true,
});
