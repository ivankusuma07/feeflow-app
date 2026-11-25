import {
  ArrowLeftRight,
  Clock,
  Coins,
  LogIn,
  Percent,
  Receipt,
  ShieldCheck,
  User,
  type LucideIcon,
} from "lucide-react";
import type { FeatureIcon as FeatureIconName } from "@/content/copy";

const ICONS: Record<FeatureIconName, LucideIcon> = {
  user: User,
  "log-in": LogIn,
  "shield-check": ShieldCheck,
  receipt: Receipt,
  clock: Clock,
  coins: Coins,
  "arrow-left-right": ArrowLeftRight,
  percent: Percent,
};

/** 20 px line icon, stroke 1.75, ink. */
export function FeatureIcon({ name }: { name: FeatureIconName }) {
  const Icon = ICONS[name];
  return <Icon size={20} strokeWidth={1.75} color="#1C1C1C" aria-hidden />;
}
