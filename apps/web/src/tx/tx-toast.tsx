"use client";

import { shortHash } from "@feeflow/sdk";
import { toast } from "@feeflow/ui";
import type { Hash } from "viem";
import { explorerTxUrl } from "@/lib/chain";

function TxLink({ hash }: { hash: Hash }) {
  const url = explorerTxUrl(hash);
  const text = <span className="font-mono">{shortHash(hash)}</span>;
  return url ? (
    <a href={url} target="_blank" rel="noopener noreferrer" className="underline">
      {text} ↗
    </a>
  ) : (
    text
  );
}

/** Transaction toasts keyed by hash, so pending → success/failure replaces the same toast. */
export const txToast = {
  pending(hash: Hash, label: string) {
    toast.loading(label, { id: hash, description: <TxLink hash={hash} /> });
  },
  success(hash: Hash, label: string) {
    toast.success(label, { id: hash, description: <TxLink hash={hash} /> });
  },
  error(message: string, hash?: Hash) {
    toast.error(message, hash ? { id: hash, description: <TxLink hash={hash} /> } : undefined);
  },
};

export { TxLink };
