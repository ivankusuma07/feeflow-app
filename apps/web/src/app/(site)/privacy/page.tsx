import type { Metadata } from "next";
import { LegalPlaceholder } from "@/components/legal-placeholder";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return <LegalPlaceholder title="Privacy Policy" />;
}
