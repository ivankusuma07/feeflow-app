import { feeFlowAbi, feeSinkAbi } from "@feeflow/abi";
import { decodeErrorResult, type Abi, type Hex } from "viem";

/**
 * Pons custom errors observed on a mainnet fork (ADR-001):
 * NotCreatorFeeRecipient 0xb9f93944 (factory), NotFeeSweepOperator 0x8d42130c (curve),
 * BelowFloor 0x4e7e2916 (sweep operator), InternalSwapRequiresOperator 0x31cdb504 (docs).
 */
export const ponsErrorsAbi = [
  { type: "error", name: "NotCreatorFeeRecipient", inputs: [] },
  { type: "error", name: "NotFeeSweepOperator", inputs: [] },
  { type: "error", name: "BelowFloor", inputs: [] },
  { type: "error", name: "InternalSwapRequiresOperator", inputs: [] },
] as const satisfies Abi;

export type DecodedErrorKind =
  | "user-rejected"
  | "insufficient-gas"
  | "attestation-expired"
  | "nothing-to-claim"
  | "wrong-network"
  | "contract"
  | "network"
  | "service"
  | "unknown";

export interface DecodedError {
  kind: DecodedErrorKind;
  /** Short, user-facing sentence. */
  message: string;
  /** Custom error name when one was decoded. */
  errorName?: string;
  /** Whether retrying the same action can succeed. */
  retryable: boolean;
}

const MESSAGES: Record<string, { kind: DecodedErrorKind; message: string; retryable: boolean }> = {
  AttestationExpired: {
    kind: "attestation-expired",
    message: "Attestation expired. Your form is kept.",
    retryable: true,
  },
  NonceUsed: {
    kind: "attestation-expired",
    message: "This approval was already used. Try again for a fresh one.",
    retryable: true,
  },
  InvalidAttestation: {
    kind: "contract",
    message: "The FeeFlow approval did not match this request. Try again.",
    retryable: true,
  },
  NothingToClaim: { kind: "nothing-to-claim", message: "Nothing to claim yet.", retryable: false },
  NothingExpired: {
    kind: "contract",
    message: "No batch has passed the 30-day window yet.",
    retryable: false,
  },
  NothingToWithdraw: {
    kind: "contract",
    message: "No FeeFlow fees to withdraw.",
    retryable: false,
  },
  NotRegistered: {
    kind: "contract",
    message: "This token is not routed through FeeFlow.",
    retryable: false,
  },
  AlreadyRegistered: {
    kind: "contract",
    message: "This token is already routed through FeeFlow.",
    retryable: false,
  },
  AlreadyExited: {
    kind: "contract",
    message: "Future fees were already moved out of FeeFlow.",
    retryable: false,
  },
  NotPonsToken: {
    kind: "contract",
    message: "This token was not launched by the Pons v2 factory.",
    retryable: false,
  },
  NotCurrentRecipient: {
    kind: "contract",
    message: "Your wallet is not this token's current creator fee recipient on Pons.",
    retryable: false,
  },
  InvalidCreatorSignature: {
    kind: "contract",
    message: "The routing signature is invalid. Sign again.",
    retryable: true,
  },
  SignatureExpired: {
    kind: "contract",
    message: "The routing signature expired. Sign again.",
    retryable: true,
  },
  RegistrationIsPaused: {
    kind: "contract",
    message: "New registrations are paused.",
    retryable: false,
  },
  InvalidXUserId: {
    kind: "contract",
    message: "That X account id is not valid.",
    retryable: false,
  },
  NotCreator: {
    kind: "contract",
    message: "Only the registering creator wallet can do this.",
    retryable: false,
  },
  InvalidRecipient: {
    kind: "contract",
    message: "Choose a different recipient wallet.",
    retryable: false,
  },
  EthTransferFailed: {
    kind: "contract",
    message: "The destination wallet rejected the ETH payment.",
    retryable: false,
  },
  NotCreatorFeeRecipient: {
    kind: "contract",
    message: "Only the token's current creator fee recipient can change it on Pons.",
    retryable: false,
  },
  BelowFloor: {
    kind: "contract",
    message: "Not enough fees have built up on Pons to sweep yet. Try again later.",
    retryable: false,
  },
  NotFeeSweepOperator: {
    kind: "contract",
    message: "Sweeps on this token run through the Pons sweep operator.",
    retryable: false,
  },
  InternalSwapRequiresOperator: {
    kind: "contract",
    message: "This sweep needs the Pons operator. The fees are safe and wait as pending.",
    retryable: false,
  },
};

const ALL_ERRORS_ABI = [...feeFlowAbi, ...feeSinkAbi, ...ponsErrorsAbi] as Abi;

function findRevertData(err: unknown, depth = 0): Hex | undefined {
  if (!err || typeof err !== "object" || depth > 6) return undefined;
  const e = err as Record<string, unknown>;
  for (const key of ["data", "raw"]) {
    const v = e[key];
    if (typeof v === "string" && /^0x[0-9a-fA-F]{8}/.test(v)) return v as Hex;
    if (v && typeof v === "object") {
      const inner = (v as Record<string, unknown>).data;
      if (typeof inner === "string" && /^0x[0-9a-fA-F]{8}/.test(inner)) return inner as Hex;
    }
  }
  return findRevertData(e.cause, depth + 1);
}

function findErrorName(err: unknown, depth = 0): string | undefined {
  if (!err || typeof err !== "object" || depth > 6) return undefined;
  const e = err as Record<string, unknown>;
  const data = e.data as Record<string, unknown> | undefined;
  if (data && typeof data.errorName === "string") return data.errorName;
  if (typeof e.errorName === "string") return e.errorName;
  return findErrorName(e.cause, depth + 1);
}

function textOf(err: unknown): string {
  if (!err || typeof err !== "object") return String(err ?? "");
  const e = err as { shortMessage?: string; message?: string; details?: string; name?: string };
  return [e.name, e.shortMessage, e.message, e.details].filter(Boolean).join(" ");
}

/**
 * An error whose message is already written for the user (e.g. from FeeFlow's own services).
 * `decodeError` passes its message through unchanged.
 */
export class UserFacingError extends Error {
  readonly userFacing = true;
  constructor(
    message: string,
    readonly retryable = true,
  ) {
    super(message);
    this.name = "UserFacingError";
  }
}

/** Turns wallet, RPC and contract errors into one short user-facing message. */
export function decodeError(err: unknown): DecodedError {
  if (err instanceof UserFacingError) {
    return { kind: "service", message: err.message, retryable: err.retryable };
  }
  const text = textOf(err);

  if (
    /UserRejected|user rejected|denied transaction|rejected the request|User denied/i.test(text)
  ) {
    return { kind: "user-rejected", message: "You cancelled in your wallet.", retryable: true };
  }

  let name = findErrorName(err);
  if (!name) {
    const data = findRevertData(err);
    if (data) {
      try {
        name = decodeErrorResult({ abi: ALL_ERRORS_ABI, data }).errorName;
      } catch {
        /* not one of ours */
      }
    }
  }
  if (name && MESSAGES[name]) return { ...MESSAGES[name]!, errorName: name };
  if (name)
    return {
      kind: "contract",
      message: `Transaction reverted: ${name}.`,
      errorName: name,
      retryable: false,
    };

  if (/insufficient funds|exceeds the balance|gas required exceeds/i.test(text)) {
    return {
      kind: "insufficient-gas",
      message: "Not enough ETH in this wallet for the network fee.",
      retryable: true,
    };
  }
  if (/chain mismatch|does not match the target chain|wrong network|ChainMismatch/i.test(text)) {
    return {
      kind: "wrong-network",
      message: "Switch to Robinhood Chain and try again.",
      retryable: true,
    };
  }
  if (/fetch failed|network error|timeout|HttpRequestError|Failed to fetch/i.test(text)) {
    return {
      kind: "network",
      message: "Network problem. Check your connection and try again.",
      retryable: true,
    };
  }
  return { kind: "unknown", message: "Something went wrong. Try again.", retryable: true };
}
