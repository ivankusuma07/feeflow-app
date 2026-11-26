"use client";

import type { LeaderboardPeriod } from "@feeflow/sdk";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { createContext, useContext, type ReactNode } from "react";
import { env } from "@/lib/config";
import { createIndexerDataSource } from "./indexer";
import type { DataSource } from "./types";

/**
 * Resolves the configured data source once.
 * - `mock`: dynamic import, so the synthetic data never ships in an indexer build.
 * - `indexer` with a URL: the REST adapter.
 * - `indexer` without a URL: `null`, and pages show their "not live yet" state. Never sample data.
 */
export function createDataSource(): Promise<DataSource | null> {
  if (env.NEXT_PUBLIC_DATA_SOURCE === "mock") {
    return import("./mock").then((m) => m.createMockDataSource());
  }
  const url = env.NEXT_PUBLIC_INDEXER_URL;
  return Promise.resolve(url ? createIndexerDataSource(url) : null);
}

let defaultSource: Promise<DataSource | null> | null = null;
const getDefaultSource = () => (defaultSource ??= createDataSource());

const SourceContext = createContext<Promise<DataSource | null> | null>(null);

/** Tests pass `source` to inject an adapter; the app uses the configured one. */
export function DataSourceProvider({
  children,
  source,
}: {
  children: ReactNode;
  source?: Promise<DataSource | null>;
}) {
  return (
    <SourceContext.Provider value={source ?? getDefaultSource()}>{children}</SourceContext.Provider>
  );
}

/** Query result: `live: false` when no data source is configured (distinct from "not found"). */
export type Live<T> = { live: false } | { live: true; value: T };

function useSourceQuery<T>(
  key: readonly unknown[],
  read: (ds: DataSource) => Promise<T>,
  enabled = true,
): UseQueryResult<Live<T>> {
  const source = useContext(SourceContext);
  if (!source) throw new Error("Data hooks must be used inside <DataSourceProvider>");
  return useQuery({
    queryKey: ["ds", ...key],
    enabled,
    queryFn: async (): Promise<Live<T>> => {
      const ds = await source;
      return ds ? { live: true, value: await read(ds) } : { live: false };
    },
  });
}

export const useDataSourceKind = () => useSourceQuery(["kind"], async (ds) => ds.kind);
export const useTotals = () => useSourceQuery(["totals"], (ds) => ds.getTotals());
export const useRecentClaims = (limit = 10) =>
  useSourceQuery(["claims", limit], (ds) => ds.getRecentClaims(limit));
export const useTopTokens = (limit = 10) =>
  useSourceQuery(["top", limit], (ds) => ds.getTopTokens(limit));
export const useLeaderboard = (period: LeaderboardPeriod, assetAddress: string, limit = 50) =>
  useSourceQuery(["leaderboard", period, assetAddress.toLowerCase(), limit], (ds) =>
    ds.getLeaderboard(period, assetAddress, limit),
  );
export const useAccountView = (xUserId: string | null) =>
  useSourceQuery(["account", xUserId], (ds) => ds.getAccount(xUserId!), xUserId !== null);
export const useTokenDetail = (address: string) =>
  useSourceQuery(["token", address.toLowerCase()], (ds) => ds.getToken(address));
export const useKeeperStatus = () => useSourceQuery(["keeper"], (ds) => ds.getKeeperStatus());
