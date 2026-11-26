"use client";

import { initials } from "@feeflow/sdk";
import { cn } from "@feeflow/ui";
import { useState } from "react";

interface AvatarProps {
  /** X avatar URL (Privy `profilePictureUrl` or the API's cached lookup), or null. */
  src: string | null | undefined;
  /** Handle or name, used for the initials fallback. */
  label: string | null | undefined;
  size?: number;
  className?: string;
}

/** Round X avatar with an initials fallback (also used when the image fails to load). */
export function Avatar({ src, label, size = 32, className }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) };
  const base = cn(
    "inline-flex flex-none items-center justify-center overflow-hidden rounded-full bg-line font-semibold",
    className,
  );
  if (!src || failed) {
    return (
      <span className={base} style={style} aria-hidden>
        {initials(label)}
      </span>
    );
  }
  return (
    // External X avatars at small fixed sizes; next/image optimisation adds nothing here.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className={base}
      style={style}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
