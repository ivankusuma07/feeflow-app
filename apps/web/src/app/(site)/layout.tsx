import { AppShell } from "@/components/shell/app-shell";

/** Marketing and legal pages: static header actions, no auth or wallet JavaScript. */
export default function SiteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AppShell>{children}</AppShell>;
}
