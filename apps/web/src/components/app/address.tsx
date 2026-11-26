"use client";

import { shortAddress } from "@feeflow/sdk";
import { cn } from "@feeflow/ui";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { explorerAddressUrl } from "@/lib/chain";

interface AddressProps {
  address: string;
  /** Link to the explorer when one is configured (default true). */
  link?: boolean;
  copy?: boolean;
  /** Suffix such as "(connected)". */
  suffix?: string;
  className?: string;
}

/** "0x12a4…9aF3" with optional explorer link and copy button; full address in title and copy. */
export function Address({ address, link = true, copy = false, suffix, className }: AddressProps) {
  const [copied, setCopied] = useState(false);
  const url = link ? explorerAddressUrl(address) : null;
  const text = (
    <span className="font-mono" title={address}>
      {shortAddress(address)}
      {suffix ? ` ${suffix}` : ""}
    </span>
  );

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer">
          {text}
          <span className="sr-only"> (on the explorer)</span>
        </a>
      ) : (
        text
      )}
      {copy ? (
        <button
          type="button"
          className="inline-flex size-7 items-center justify-center rounded-md text-muted hover:bg-subtle"
          aria-label={copied ? "Address copied" : "Copy address"}
          onClick={() => {
            void navigator.clipboard?.writeText(address).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
        </button>
      ) : null}
    </span>
  );
}
