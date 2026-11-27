import {
  Compass,
  Download,
  FileText,
  LayoutDashboard,
  LayoutGrid,
  Route,
  Trophy,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** The sidebar, in order. "Home" matches only "/"; the others also match their sub-paths. */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Home", icon: LayoutGrid },
  { href: "/explore", label: "Explore", icon: Compass },
  { href: "/payments", label: "Payments", icon: Wallet },
  { href: "/claim", label: "Claim fees", icon: Download },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/route", label: "Route a token", icon: Route },
  { href: "/docs", label: "Docs", icon: FileText },
];

export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
