import Image from "next/image";
import Link from "next/link";
import { Badge, Button, Card, IconTile, cn } from "@feeflow/ui";
import { FeatureIcon } from "@/components/landing/feature-icon";
import { LiveOverview } from "@/components/landing/live-overview";
import {
  disclosuresShort,
  faq,
  features,
  feeSources,
  hero,
  howItWorks,
  roadmap,
} from "@/content/copy";
import { config } from "@/lib/config";

const ROADMAP_TONE = {
  Now: "accent",
  Next: "outline",
  Later: "muted",
} as const;

export default function LandingPage() {
  return (
    <main id="main" className="container-page">
      {/* Hero: text and buttons only, no illustration. */}
      <section className="pt-20 pb-16 text-center md:pt-24 md:pb-[72px]">
        <p className="mb-5 font-mono text-[13px] text-muted">{hero.eyebrow}</p>
        <h1 className="mx-auto max-w-[820px] text-[40px] leading-[1.05] font-semibold tracking-[-0.02em] md:text-[56px]">
          {hero.headline}
        </h1>
        <p className="mx-auto mt-5 max-w-[640px] text-[17px] leading-normal text-muted md:text-[19px]">
          {hero.subline}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-5">
          <Button asChild size="lg">
            <Link href="/dashboard">Open app</Link>
          </Button>
          <Link href="/payments" className="text-[15px] font-medium">
            See every payment →
          </Link>
        </div>
      </section>

      <LiveOverview />

      <section className="pt-28" aria-labelledby="how-it-works">
        <h2 id="how-it-works" className="section-title">
          How it works
        </h2>
        <ol className="mt-8 grid list-none grid-cols-1 gap-5 p-0 sm:grid-cols-2 lg:grid-cols-4">
          {howItWorks.map((step, i) => (
            <li key={step.title} className="card overflow-hidden p-0">
              <Image
                src={step.image}
                alt={step.alt}
                width={1400}
                height={1050}
                sizes="(min-width: 1024px) 280px, (min-width: 640px) 50vw, 100vw"
                className="block aspect-[4/3] h-auto w-full bg-subtle-2 object-cover"
              />
              <div className="px-6 pt-5 pb-6">
                <span className="inline-flex size-8 items-center justify-center rounded-lg border border-ink bg-accent font-mono font-medium text-black">
                  {i + 1}
                </span>
                <h3 className="mt-[18px] mb-2 text-[17px] font-semibold">{step.title}</h3>
                <p className="m-0 leading-[1.55] text-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="pt-28" aria-labelledby="what-you-get">
        <h2 id="what-you-get" className="section-title">
          What you get
        </h2>
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <Card key={f.title} tone={f.accent ? "accent" : "default"}>
              <IconTile onAccent={f.accent}>
                <FeatureIcon name={f.icon} />
              </IconTile>
              <h3 className="mb-2 text-base font-semibold">{f.title}</h3>
              <p className={cn("m-0 leading-[1.55]", f.accent ? "text-ink" : "text-muted")}>
                {f.body}
              </p>
            </Card>
          ))}
        </div>
      </section>

      <section
        className="grid grid-cols-1 gap-5 pt-28 md:grid-cols-12"
        aria-labelledby="fee-sources"
      >
        <div className="md:col-span-7">
          <h2 id="fee-sources" className="section-title">
            Where the fees come from
          </h2>
          <ul className="mt-7 flex flex-col gap-3.5 pl-5 leading-relaxed text-body">
            {feeSources.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
        <Card className="self-start md:col-span-5 md:mt-[72px]">
          <div className="text-sm text-muted">FeeFlow fee</div>
          <div className="mt-2 font-mono text-5xl font-medium">1%</div>
          <p className="mt-3 leading-[1.55] text-body">
            When fees are collected from the Pons escrow, 1% goes to FeeFlow&apos;s fee address and
            99% is credited to the X account. The rate is a constant with no setter.
          </p>
          <div className="mt-4 border-t border-line pt-4 font-mono text-[13px] text-muted">
            FEE_BPS() = — · read from contract after deploy
          </div>
        </Card>
      </section>

      <section className="pt-28" aria-labelledby="roadmap">
        <h2 id="roadmap" className="section-title">
          Roadmap
        </h2>
        <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
          {roadmap(config.auditStatus).map((r) => (
            <Card key={r.stage}>
              <Badge tone={ROADMAP_TONE[r.stage]} size="md">
                {r.stage}
              </Badge>
              <p className="mt-3.5 leading-relaxed text-body">{r.body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-5 pt-28 md:grid-cols-12" aria-labelledby="faq">
        <h2 id="faq" className="section-title md:col-span-4">
          FAQ
        </h2>
        <div className="border-t border-line md:col-span-8">
          {faq.map((item, i) => (
            <details key={item.q} open={i === 0} className="border-b border-line">
              <summary className="py-[18px] text-base font-semibold">{item.q}</summary>
              <p className="mt-0 mb-[18px] leading-relaxed text-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section id="disclosures" className="card mt-28" aria-labelledby="disclosures-title">
        <h2 id="disclosures-title" className="m-0 text-[22px] font-semibold">
          Disclosures
        </h2>
        <ul className="mt-4 grid grid-cols-1 gap-x-10 gap-y-2.5 pl-5 text-sm leading-[1.55] text-muted md:grid-cols-2">
          {disclosuresShort(config.auditStatus).map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
        <Link href="/disclosures" className="mt-4 inline-block text-sm font-medium">
          Read all disclosures →
        </Link>
      </section>
    </main>
  );
}
