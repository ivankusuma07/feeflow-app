import { AppHeaderActions } from "@/components/app/header-actions";
import { MockBanner } from "@/components/app/mock-banner";
import { AppShell } from "@/components/shell/app-shell";
import { AppProviders } from "../providers";

/** App routes: Privy, wagmi and the data source, plus the auth-aware header actions. */
export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <AppProviders>
      <AppShell actions={<AppHeaderActions />} banner={<MockBanner />}>
        {children}
      </AppShell>
    </AppProviders>
  );
}
