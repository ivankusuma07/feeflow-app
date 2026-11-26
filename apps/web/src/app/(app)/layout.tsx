import { AppHeaderActions } from "@/components/app/header-actions";
import { MockBanner } from "@/components/app/mock-banner";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { AppProviders } from "../providers";

/** App routes: Privy, wagmi and the data source, plus the auth-aware header. */
export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <AppProviders>
      <SiteHeader actions={<AppHeaderActions />} />
      <MockBanner />
      {children}
      <SiteFooter />
    </AppProviders>
  );
}
