/**
 * InvariantViolation — the halt signal.
 *
 * The eight invariants (protocol §5) are the absolute conditions of the loop:
 * "To overwrite one is not to edit a datum but to halt the loop." A step about
 * to violate an INV MUST halt the loop, not work around it (CONTEXT.md §3,
 * AGENTS.md "The Invariants are hard runtime guards").
 *
 * Halting is therefore modelled as a thrown error, never a returned boolean a
 * caller could ignore. The loop, once built, MUST let this propagate as a halt
 * and MUST NOT catch-and-continue.
 */

export type InvariantId =
  | "INV-1"
  | "INV-2"
  | "INV-3"
  | "INV-4"
  | "INV-5"
  | "INV-6"
  | "INV-7"
  | "INV-8";

export class InvariantViolation extends Error {
  readonly invariant: InvariantId;

  constructor(invariant: InvariantId, detail: string) {
    super(`${invariant} violated: ${detail}`);
    this.name = "InvariantViolation";
    this.invariant = invariant;
    // Preserve prototype chain under transpilation to ES targets.
    Object.setPrototypeOf(this, InvariantViolation.prototype);
  }
}

/** Throw the halt signal for a given invariant. */
export function halt(invariant: InvariantId, detail: string): never {
  throw new InvariantViolation(invariant, detail);
}
