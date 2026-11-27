"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { isAddress } from "viem";
import { cn } from "@feeflow/ui";

/** Top-bar search: a token contract address opens that token's page. */
export function TokenSearch({ className }: { className?: string }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [invalid, setInvalid] = useState(false);
  const hintId = useId();

  return (
    <form
      role="search"
      className={cn("relative", className)}
      onSubmit={(e) => {
        e.preventDefault();
        const q = value.trim();
        if (!q) return;
        if (!isAddress(q, { strict: false })) {
          setInvalid(true);
          return;
        }
        setInvalid(false);
        router.push(`/tokens/${q.toLowerCase()}`);
      }}
    >
      <Search
        size={16}
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setInvalid(false);
        }}
        placeholder="Search by token address"
        aria-label="Search by token address"
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? hintId : undefined}
        spellCheck={false}
        autoComplete="off"
        className="h-10 w-full rounded-full border border-line bg-subtle-2 pr-4 pl-10 font-sans text-sm text-ink placeholder:text-muted focus:border-line-strong focus:bg-surface focus:outline-none"
      />
      {invalid && (
        <p
          id={hintId}
          role="status"
          className="absolute top-full left-4 z-10 mt-1 rounded-md bg-surface px-2 py-1 text-[13px] text-error shadow"
        >
          Enter a token contract address (0x…).
        </p>
      )}
    </form>
  );
}
