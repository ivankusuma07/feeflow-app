import Image from "next/image";
import Link from "next/link";
import { Card, CardHeader, CardTitle, LiveLabel } from "@feeflow/ui";
import { StatCard } from "@/components/stat-card";
import { notLiveNote } from "@/content/copy";
import { config, contractLabel } from "@/lib/config";

/**
 * Bento overview under the hero: top tokens (7) + leaderboard (5), then three
 * metric cards. Until the contract and indexer are configured it shows the
 * empty state and "—", never sample numbers.
 */
export function LiveOverview() {
  return (
    <>
      <section aria-label="Live overview" className="grid grid-cols-1 gap-5 md:grid-cols-12">
        <Card className="md:col-span-7">
          <CardHeader
            title="Top fee-earning tokens"
            action={
              <Link href="/payments" className="text-sm">
                View all
              </Link>
            }
          />
          <div className="mt-3 flex flex-wrap items-center gap-6">
            <Image
              src="/illustrations/empty.webp"
              alt=""
              width={240}
              height={180}
              className="h-auto w-[240px] max-w-full mix-blend-multiply"
            />
            <div className="min-w-[180px] flex-1">
              <p className="m-0 font-semibold">No tokens routed yet</p>
              <p className="mt-1.5 text-sm leading-normal text-muted">
                Routed tokens and their fees appear here once the FeeFlow contract is live.
              </p>
            </div>
          </div>
        </Card>

        <Card className="md:col-span-5">
          <div className="flex items-center gap-2.5">
            <CardTitle>Leaderboard</CardTitle>
            <LiveLabel />
          </div>
          <ol className="mt-4 flex list-none flex-col gap-2.5 p-0">
            {[1, 2, 3].map((rank) => (
              <li
                key={rank}
                className="grid grid-cols-[24px_36px_1fr] items-center gap-3 rounded-[10px] border border-line px-3.5 py-2.5"
              >
                <span className="font-mono">{rank}</span>
                <span aria-hidden className="size-9 rounded-full bg-subtle" />
                <div>
                  <div className="font-mono text-sm">—</div>
                  <div aria-hidden className="mt-1.5 h-1.5 rounded-[3px] bg-line" />
                </div>
              </li>
            ))}
          </ol>
        </Card>

        <StatCard
          className="md:col-span-4"
          label="Total fees received"
          value={null}
          progress={null}
        />
        <StatCard className="md:col-span-4" label="Total claimed" value={null} progress={null} />
        <StatCard
          className="md:col-span-4"
          label="Accrued, not yet sent"
          value={null}
          progress={null}
        />
      </section>
      <div className="mt-3.5 flex flex-wrap justify-between gap-4 text-[13px] text-muted">
        <span>{config.isLive ? "Live data from the FeeFlow indexer." : notLiveNote}</span>
        <span className="font-mono break-all">Tokens routed — · Contract: {contractLabel}</span>
      </div>
    </>
  );
}
