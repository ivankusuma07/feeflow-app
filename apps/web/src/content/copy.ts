/**
 * Copy taken verbatim from the approved page designs (which follow the build
 * brief, sections 3.2–3.10). Do not add claims here that are not in the brief.
 */

export const PONS_AUDIT_NOTE_DATE = "21 Nov 2026";

export const hero = {
  eyebrow: "Built on Robinhood Chain for tokens launched on Pons v2.",
  headline: "Route creator fees to X accounts.",
  subline:
    "Creator fees, routed to the X account behind every launch. Held onchain, claimable anytime, verifiable by anyone.",
} as const;

export const howItWorks = [
  {
    title: "Launch on Pons.",
    body: "Create your token on Pons v2 as usual.",
    image: "/illustrations/step1-launch.webp",
    alt: "A rocket lifting off",
  },
  {
    title: "Route to FeeFlow.",
    body: "Set FeeFlow as the creator fee recipient at launch, or move it later with one transaction. Pick the X account that should receive the fees.",
    image: "/illustrations/step2-route.webp",
    alt: "A pipe rerouting coins to a profile",
  },
  {
    title: "Fees are collected.",
    body: "A keeper sweeps fees through the Pons escrow into the FeeFlow contract and credits them to that X account. Anyone can trigger this step.",
    image: "/illustrations/step3-collect.webp",
    alt: "A robot arm moving coins into a vault",
  },
  {
    title: "Claim with X.",
    body: "The account owner logs in with X, connects a wallet, and claims. Unclaimed fees stay onchain.",
    image: "/illustrations/step4-claim.webp",
    alt: "Coins dropping into a wallet",
  },
] as const;

export type FeatureIcon =
  | "user"
  | "log-in"
  | "shield-check"
  | "receipt"
  | "clock"
  | "coins"
  | "arrow-left-right"
  | "percent";

export const features: readonly {
  icon: FeatureIcon;
  title: string;
  body: string;
  accent?: boolean;
}[] = [
  {
    icon: "user",
    title: "Fees follow an identity",
    body: "Balances are recorded per X account, not per anonymous wallet.",
  },
  {
    icon: "log-in",
    title: "Claim with X login",
    body: "Log in with X, connect a wallet, claim. No forms, no manual payouts.",
  },
  {
    icon: "shield-check",
    title: "Non-custodial by design",
    body: "The contract has no admin withdrawal of user balances. Split rules are fixed in the contract.",
  },
  {
    icon: "receipt",
    title: "Public payments",
    body: "Every fee received, every claim, and every pending amount is listed with a link to the chain.",
  },
  {
    icon: "clock",
    title: "Honest pending numbers",
    body: "Fees earned but not yet swept or collected are shown, so nothing looks smaller than it is.",
  },
  {
    icon: "coins",
    title: "Paid in the pair asset",
    body: "USDG pairs pay USDG; ETH pairs pay ETH as is.",
  },
  {
    icon: "arrow-left-right",
    title: "Swap after claiming",
    body: "Send what you claimed to Uniswap from your own wallet. Stock Tokens aren't available in some countries.",
  },
  {
    icon: "percent",
    title: "One fixed fee: 1%",
    body: "FeeFlow keeps 1% of fees it collects. It is fixed in the contract and can never be changed.",
    accent: true,
  },
];

export const feeSources = [
  "Every trade of a Pons v2 token pays a standard fee, plus any creator tax set at launch. Pons takes its share first; the creator share is fixed per token at launch.",
  "The creator share accrues on the token's bonding curve, or on the Pons hook after graduation, until it is swept into the Pons fee escrow.",
  "FeeFlow's keeper sweeps where Pons allows it and pulls the escrow balance into the FeeFlow contract, which credits the X account bound to that token.",
  "Fees are paid in the token's pair asset: USDG for USDG pairs, ETH for ETH pairs.",
  "If the keeper is down, fees are not lost: they wait in the curve, hook, or escrow, and anyone can trigger collection from the token page.",
] as const;

export const roadmap = (auditStatus: string) =>
  [
    {
      stage: "Now",
      body: "Routing, X login and claim, dashboard, leaderboard, public Payments page, keeper, swap link to Uniswap after claim.",
    },
    { stage: "Next", body: `Contract audit: ${auditStatus}.` },
    {
      stage: "Later",
      body: "Less trust in the attestation service, for example cryptographic proofs of X account ownership. Not promised.",
    },
  ] as const;

export const faq = [
  {
    q: "What is FeeFlow?",
    a: "A contract and web app that routes the creator fees of Pons v2 tokens on Robinhood Chain to the X account behind each launch.",
  },
  {
    q: "Who can claim?",
    a: "Whoever controls the X account bound to the token, after logging in with X and connecting a wallet.",
  },
  {
    q: "Does FeeFlow hold my funds?",
    a: "Unclaimed balances sit in the FeeFlow contract, not in a team wallet. The contract has no function that lets the team withdraw them.",
  },
  {
    q: "Why does my balance show “pending”?",
    a: "Pons credits fees to its escrow only after a sweep, and FeeFlow must then collect them. You can trigger collection from the token page.",
  },
  {
    q: "Is there a claim deadline?",
    a: "Yes: 30 days per credited amount, from the collect transaction. After that, anyone can send it to the creator wallet that registered the token. It never goes to FeeFlow. Claiming always pays the full credited balance.",
  },
  {
    q: "What currency am I paid in?",
    a: "The token's pair asset. USDG-paired tokens pay USDG; ETH-paired tokens pay ETH as is.",
  },
  {
    q: "Does FeeFlow take a fee?",
    a: "Yes, a fixed 1% of fees collected into FeeFlow. Pons's own protocol share is separate and taken before fees reach the escrow.",
  },
  {
    q: "Can the routing be changed?",
    a: "Both the X account owner and the registering creator can move future fees out of FeeFlow. Amounts already credited stay claimable by the X account owner.",
  },
  {
    q: "Is there a FeeFlow token?",
    a: "Yes, FLOW ($FLOW), launched via Pons v2. You do not need it to use FeeFlow.",
  },
  { q: "Is this financial advice?", a: "No." },
] as const;

/** Short list shown on the landing page. */
export const disclosuresShort = (auditStatus: string) => [
  "FeeFlow is software, not a financial service. Nothing here is investment, legal, or tax advice.",
  `Payouts depend on trading activity, on Pons v2 (unaudited as of ${PONS_AUDIT_NOTE_DATE}), and on a keeper. There is no guaranteed amount.`,
  "Balances are attributed to X accounts using a FeeFlow attestation service.",
  "USDG is issued by Paxos, which can freeze, wipe, or pause USDG.",
  "Each credited amount is claimable for 30 days; after that, anyone can send it to the registering creator, never to FeeFlow.",
  "FeeFlow keeps a fixed 1% of fees it collects into the contract.",
  "The registering creator and the X account owner can redirect future fees out of FeeFlow.",
  `Smart contracts can have bugs. FeeFlow audit status: ${auditStatus}.`,
];

/** Full list for /docs and /disclosures. */
export const disclosuresFull = (auditStatus: string) => [
  "FeeFlow is software, not a financial service. Nothing here is investment, legal, or tax advice.",
  "Payouts depend on trading activity, on Pons v2 (unaudited as of 21 November 2026), and on a keeper. Fees can be delayed; there is no guaranteed amount.",
  "Balances are attributed to X accounts using a FeeFlow attestation service; see Trust assumptions.",
  "USDG is issued by Paxos, which can freeze, wipe, or pause USDG.",
  "Each credited amount is claimable for 30 days from its collect transaction; after that, anyone can send it to the creator wallet that registered the token, never to FeeFlow.",
  "FeeFlow keeps a fixed 1% of fees it collects into the contract. The rate cannot be changed.",
  "The registering creator, as well as the X account owner, can redirect future fees out of FeeFlow; already-credited amounts stay with the X account owner.",
  "The swap link after claiming opens Uniswap, a third-party app. Stock Tokens aren't available in some countries.",
  `Smart contracts can have bugs. FeeFlow audit status: ${auditStatus}.`,
  "FLOW ($FLOW) is FeeFlow's token. You do not need it to use FeeFlow, and holding it entitles you to nothing from FeeFlow's fees.",
];

export const termsSummary =
  "The full Terms of Service and Privacy Policy are being drafted. Summary of the Terms: FeeFlow's fee is a fixed 1% of fees collected into the contract; each credited amount has a 30-day claim window with fallback to the registering creator; the creator and X account owner can both redirect future fees.";

export const footerNote =
  "Not financial advice. FeeFlow fee: 1% of collected fees, fixed. Stock Tokens aren't available in some countries.";

export const notLiveNote = "Live data appears after the FeeFlow contract is deployed.";
