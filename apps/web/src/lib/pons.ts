import { parseAbi } from "viem";

/** Pons sweep operator (verified on the fork, ADR-001): curves only accept sweeps from it. */
export const ponsSweepOperatorAbi = parseAbi(["function sweepCurve(address curve)"]);
