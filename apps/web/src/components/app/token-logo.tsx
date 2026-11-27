"use client";

import { initials } from "@feeflow/sdk";
import { Monogram, cn } from "@feeflow/ui";
import Image from "next/image";
import { useState } from "react";

interface TokenLogoProps {
  token: { name: string; imageUrl: string | null };
  /** Fixed square size in px. Omit to fill a positioned parent (grid tiles). */
  size?: number;
  className?: string;
}

/**
 * Pons token logo (from the token's `logo()` on IPFS, served through Next's image optimiser so
 * visitors never contact the gateway), with the initials tile as the fallback when there is no
 * logo or it fails to load. Decorative: the token name is always shown next to it.
 */
export function TokenLogo({ token, size, className }: TokenLogoProps) {
  const [failed, setFailed] = useState(false);
  const src = failed ? null : token.imageUrl;

  if (size !== undefined) {
    if (!src) return <Monogram text={initials(token.name)} size={size} className={className} />;
    return (
      <Image
        src={src}
        alt=""
        width={size}
        height={size}
        className={cn("flex-none rounded-[10px] bg-subtle object-cover", className)}
        style={{ width: size, height: size }}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        "relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-[10px] bg-subtle font-mono text-4xl font-medium text-ink/80",
        className,
      )}
    >
      {src ? (
        <Image
          src={src}
          alt=""
          fill
          sizes="(min-width: 1280px) 220px, (min-width: 768px) 30vw, 50vw"
          className="object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        initials(token.name)
      )}
    </span>
  );
}
