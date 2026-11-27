import { THIRD_PARTY_ADDRESSES } from "@feeflow/config";
import { Button, Card, Table, TableScroll, Td, Th } from "@feeflow/ui";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { disclosuresFull, PONS_AUDIT_NOTE_DATE, termsSummary } from "@/content/copy";
import { APP_CHAIN_ID, explorerAddressUrl } from "@/lib/chain";
import { env, links } from "@/lib/config";

export const metadata: Metadata = {
  title: "Docs",
  description: "How FeeFlow works, its trust assumptions, contract addresses and disclosures.",
};

const SECTIONS = [
  { id: "how", label: "How it works" },
  { id: "trust", label: "Trust assumptions" },
  { id: "contracts", label: "Contract addresses" },
  { id: "claim-window", label: "Claim window" },
  { id: "disclosures", label: "Disclosures" },
  { id: "legal", label: "Terms and privacy" },
] as const;

const HOW = [
  "A creator registers their Pons v2 token with FeeFlow and binds it to an X account. FeeFlow deploys a fee sink for that token.",
  "The creator points the token's Pons creator fee recipient at the sink. Only future fees move.",
  "A keeper sweeps fees on Pons and collects them from the Pons escrow into FeeFlow. Anyone can do the same from the token page.",
  "FeeFlow keeps 1% and credits 99% to the X account. The account owner logs in with X, connects a wallet and claims.",
  "After claiming, they can swap on Uniswap from their own wallet if they want. FeeFlow is not involved in the swap.",
];

const TRUST: { title: string; body: string }[] = [
  {
    title: "Attestation service",
    body: "A FeeFlow-run key signs that a session controls an X account. If it were compromised it could authorise claims for a handle. The key sits in a key service, signatures expire quickly, each is single-use, and the key can only be rotated by a multisig after a delay.",
  },
  {
    title: "Keeper",
    body: "Keeps collection running. It cannot move user funds, and anyone can collect if it stops.",
  },
  {
    title: "Pons v2",
    body: `Unaudited as of ${PONS_AUDIT_NOTE_DATE}. Pons can propose a community takeover of an abandoned token after a 3-day public delay, and may deploy new contracts.`,
  },
  {
    title: "Paxos (USDG)",
    body: "Paxos can freeze, wipe, or pause USDG, including USDG held inside FeeFlow.",
  },
  {
    title: "Creator and X account owner",
    body: "Both can redirect future fees out of FeeFlow at any time. FeeFlow does not arbitrate. Already-credited amounts stay with the X account.",
  },
  {
    title: "Uniswap and Stock Tokens",
    body: "The post-claim swap link opens Uniswap, a separate app. Stock Tokens aren't available in some countries, and their issuer can pause or freeze them.",
  },
];

function AddressCell({ address, empty = "—" }: { address: string | undefined; empty?: string }) {
  if (!address) return <span className="text-muted">{empty}</span>;
  const url = explorerAddressUrl(address);
  return url ? (
    <a href={url} target="_blank" rel="noopener noreferrer" className="break-all">
      {address}
      <span aria-hidden> ↗</span>
      <span className="sr-only"> (on the explorer)</span>
    </a>
  ) : (
    <span className="break-all">{address}</span>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <Card as="section" id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24">
      <h2 id={`${id}-title`} className="m-0 text-xl font-semibold">
        {title}
      </h2>
      {children}
    </Card>
  );
}

export default function DocsPage() {
  const pons = THIRD_PARTY_ADDRESSES[APP_CHAIN_ID];
  const rows: { name: string; address: ReactNode; note: string }[] = [
    {
      name: "FeeFlow",
      address: <AddressCell address={env.NEXT_PUBLIC_CONTRACT_ADDRESS} empty="Not deployed yet" />,
      note: "Non-upgradeable",
    },
    {
      name: "FeeSink implementation",
      address: (
        <AddressCell
          address={env.NEXT_PUBLIC_SINK_IMPLEMENTATION_ADDRESS}
          empty="Not deployed yet"
        />
      ),
      note: "One clone per routed token",
    },
    // Set at deploy; shown once the indexer or a public env var carries them.
    {
      name: "FeeFlow fee recipient",
      address: <AddressCell address={undefined} />,
      note: "Immutable after deploy",
    },
    {
      name: "Attester",
      address: <AddressCell address={undefined} />,
      note: "Rotated only via timelock",
    },
    {
      name: "Admin multisig",
      address: <AddressCell address={undefined} />,
      note: "Cannot move balances or change fees",
    },
    {
      name: "Pons v2 factory",
      address: <AddressCell address={pons?.ponsFactory} />,
      note: "Third party",
    },
    {
      name: "Pons fee escrow",
      address: <AddressCell address={pons?.ponsEscrow} />,
      note: "Older tokens may use an older escrow",
    },
    { name: "USDG", address: <AddressCell address={pons?.usdg} />, note: "Issued by Paxos" },
  ];

  return (
    <main id="main" className="container-page pt-10 pb-20">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav aria-label="Docs" className="lg:sticky lg:top-24 lg:self-start">
          <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-2 p-0 text-sm lg:flex-col lg:gap-y-2.5">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-muted no-underline hover:text-ink">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex min-w-0 flex-col gap-5">
          <h1 className="m-0 text-4xl font-semibold tracking-tight">Docs</h1>

          <Section id="how" title="How it works">
            <ol className="mt-4 mb-0 flex flex-col gap-2.5 pl-5 leading-relaxed text-body">
              {HOW.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </Section>

          <Section id="trust" title="Trust assumptions">
            <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2">
              {TRUST.map((t) => (
                <div key={t.title}>
                  <h3 className="m-0 text-base font-semibold">{t.title}</h3>
                  <p className="mt-1.5 mb-0 text-sm leading-relaxed text-muted">{t.body}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section id="contracts" title="Contract addresses">
            <p className="mt-2 mb-0 text-sm text-muted">
              Robinhood Chain, chain id {APP_CHAIN_ID}. Pons and USDG addresses are re-verified
              before each deploy.
            </p>
            <TableScroll className="mt-4 -mx-6 sm:mx-0">
              <Table className="min-w-[640px]">
                <thead>
                  <tr>
                    <Th>Contract</Th>
                    <Th>Address</Th>
                    <Th>Notes</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.name}>
                      <Td className="whitespace-nowrap">{r.name}</Td>
                      <Td className="font-mono text-[13px]">{r.address}</Td>
                      <Td className="text-muted">{r.note}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableScroll>
          </Section>

          <Section id="claim-window" title="Claim window">
            <p className="mt-3 mb-0 leading-relaxed text-body">
              Each time fees are collected into FeeFlow for a token, that amount gets its own 30-day
              clock, starting at the collect transaction. Claiming always pays the full credited
              balance. After 30 days, anyone can release an unclaimed amount to the creator wallet
              that registered the token. It never goes to FeeFlow. Until someone releases it, the X
              account owner can still claim it.
            </p>
          </Section>

          <Section id="disclosures" title="Disclosures">
            <ul className="mt-4 mb-0 flex flex-col gap-2.5 pl-5 leading-relaxed text-body">
              {disclosuresFull.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </Section>

          <Section id="legal" title="Terms and privacy">
            <p className="mt-3 mb-0 leading-relaxed text-body">{termsSummary}</p>
            <div className="mt-4 flex flex-wrap gap-2.5">
              <Button asChild variant="secondary">
                <Link href={links.terms}>Terms of Service</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href={links.privacy}>Privacy Policy</Link>
              </Button>
            </div>
          </Section>
        </div>
      </div>
    </main>
  );
}
