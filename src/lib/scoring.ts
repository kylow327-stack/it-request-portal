import type { Complexity, Priority, ScoreBreakdown, ValueBand } from "./types";

/** Locked BA defaults: U40 / I25 / C15 / V20 */
export function scorePriority(
  urgency: Priority,
  impact: boolean,
  complexity: Complexity,
  value: ValueBand
): { total: number; band: Priority; breakdown: ScoreBreakdown } {
  const us = { P0: 40, P1: 30, P2: 18, P3: 8 }[urgency];
  const is = impact ? 25 : 8;
  const cs = { low: 15, med: 10, high: 5 }[complexity];
  const vs = { high: 20, med: 12, low: 5 }[value];
  const total = us + is + cs + vs;
  let band: Priority = "P3";
  if (total >= 85) band = "P0";
  else if (total >= 70) band = "P1";
  else if (total >= 50) band = "P2";
  return {
    total,
    band,
    breakdown: { urgency: us, impact: is, complexity: cs, value: vs },
  };
}

export function suggestSlaFromPriority(
  priority: Priority,
  from = new Date()
): string {
  const days = { P0: 2, P1: 5, P2: 10, P3: 20 }[priority];
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
