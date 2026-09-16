import { U64_MAX } from "./amounts.ts";

export type OperationKind = "buy" | "sell" | "rebalance";

/** Decoded from chain, never reconstructed from browser progress alone. */
export interface OperationSnapshot {
  nonce: bigint;
  phase: "idle" | "active" | "exiting" | "closed";
  legCount: number;
  completed: readonly boolean[];
}

export type RecoveryAction =
  | { kind: "none" }
  | { kind: "withdraw-holdings" }
  | { kind: "finish"; nonce: bigint }
  | { kind: "prepare-leg"; nonce: bigint; index: number };

/** This selects work; it does not authorize or submit transactions. */
export function nextAction(snapshot: OperationSnapshot): RecoveryAction {
  if (snapshot.nonce < 0n || snapshot.nonce > U64_MAX) {
    throw new Error("Invalid nonce");
  }
  if (!Number.isInteger(snapshot.legCount)
    || snapshot.legCount < 0 || snapshot.legCount > 6
    || snapshot.completed.length !== snapshot.legCount
    || snapshot.completed.some((done) => typeof done !== "boolean")) {
    throw new Error("Invalid operation snapshot");
  }
  if (snapshot.phase === "closed" || snapshot.phase === "idle") {
    return { kind: "none" };
  }
  if (snapshot.phase === "exiting") return { kind: "withdraw-holdings" };
  if (snapshot.phase !== "active" || snapshot.legCount === 0) {
    throw new Error("Invalid active operation");
  }
  const index = snapshot.completed.findIndex((complete) => !complete);
  return index === -1
    ? { kind: "finish", nonce: snapshot.nonce }
    : { kind: "prepare-leg", nonce: snapshot.nonce, index };
}
