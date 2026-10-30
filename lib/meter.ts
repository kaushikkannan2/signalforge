// ============================================================================
// Usage metering and credit enforcement (Flexprice).
//
// Two things happen on every metered operation:
//   1. A local ledger entry. This is the enforcement source of truth, so the
//      credit gate is deterministic and cannot be defeated by a network blip
//      to a billing provider.
//   2. A mirrored event to Flexprice's /v1/events. This is the billing record.
//      Mirroring is fire-and-forget by design: a billing outage must not take
//      down the enrichment pipeline, but it is recorded per event whether the
//      mirror succeeded, so the ledger never silently diverges from the
//      invoice without anyone being able to tell.
// ============================================================================

import { db } from "./db";
import { emit } from "./thinking";
import { id as mkId, now } from "./ids";
import type { MeteredEventName, MeterEvent } from "./types";

export const flexpriceConfigured = () => Boolean(process.env.FLEXPRICE_API_KEY);

export class InsufficientCreditsError extends Error {
  constructor(
    readonly required: number,
    readonly balance: number,
    readonly operation: MeteredEventName,
  ) {
    super(
      `Insufficient credits for ${operation}: needs ${required}, balance ${balance}. Top up to continue.`,
    );
    this.name = "InsufficientCreditsError";
  }
}

export function quote(eventName: MeteredEventName, units = 1): number {
  return db.ledger.unitCosts[eventName] * units;
}

export function canAfford(eventName: MeteredEventName, units = 1): boolean {
  return db.ledger.balance >= quote(eventName, units);
}

/**
 * The gate. Call this BEFORE doing the expensive work — the whole point is to
 * refuse to spend a vendor call we cannot bill for.
 */
export function assertCredits(eventName: MeteredEventName, units = 1, runId?: string): void {
  const required = quote(eventName, units);
  if (db.ledger.balance < required) {
    if (runId) {
      emit(runId, "Billing", "gate", `Blocked: ${eventName} needs ${required} credits`, {
        detail: `Balance is ${db.ledger.balance}. High-cost enrichment is gated until the organisation tops up.`,
      });
    }
    throw new InsufficientCreditsError(required, db.ledger.balance, eventName);
  }
}

export async function meter(
  eventName: MeteredEventName,
  properties: Record<string, string | number | boolean> = {},
  opts: { units?: number; runId?: string } = {},
): Promise<MeterEvent> {
  const units = opts.units ?? 1;
  const credits = quote(eventName, units);

  db.ledger.consumed += credits;
  db.ledger.balance = Math.max(0, db.ledger.granted - db.ledger.consumed);

  const event: MeterEvent = {
    id: mkId("evt"),
    eventName,
    externalCustomerId: db.ledger.customerId,
    credits,
    properties: { ...properties, units },
    mirroredToFlexprice: false,
    at: now(),
  };
  db.meterEvents.push(event);

  if (flexpriceConfigured()) {
    try {
      const base = process.env.FLEXPRICE_BASE_URL ?? "https://us.api.flexprice.io/v1";
      const res = await fetch(`${base}/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.FLEXPRICE_API_KEY!,
        },
        body: JSON.stringify({
          event_name: eventName,
          external_customer_id: event.externalCustomerId,
          event_id: event.id,
          timestamp: event.at,
          properties: { ...event.properties, credits },
          source: "grapevine",
        }),
      });
      event.mirroredToFlexprice = res.ok;
      if (!res.ok) event.flexpriceError = `${res.status} ${(await res.text()).slice(0, 160)}`;
    } catch (err) {
      event.flexpriceError = err instanceof Error ? err.message : String(err);
    }
  } else {
    event.flexpriceError = "FLEXPRICE_API_KEY not set — metered locally only";
  }

  if (opts.runId) {
    emit(opts.runId, "Billing", "validation", `Metered ${eventName}: −${credits} credits`, {
      detail: `Balance ${db.ledger.balance}/${db.ledger.granted}. Flexprice mirror: ${
        event.mirroredToFlexprice ? "accepted" : event.flexpriceError
      }`,
    });
  }

  return event;
}

export function topUp(credits: number, runId?: string) {
  db.ledger.granted += credits;
  db.ledger.balance = db.ledger.granted - db.ledger.consumed;
  if (runId) {
    emit(runId, "Billing", "gate", `Credit top-up: +${credits}`, {
      detail: `Balance is now ${db.ledger.balance}. Gated operations resume.`,
    });
  }
  return db.ledger;
}

/** Per-lead cost allocation, for the commercial ledger view. */
export function costPerLead(): { leadId: string; credits: number }[] {
  const byLead = new Map<string, number>();
  for (const e of db.meterEvents) {
    const leadId = String(e.properties.leadId ?? e.properties.personId ?? "unattributed");
    byLead.set(leadId, (byLead.get(leadId) ?? 0) + e.credits);
  }
  return [...byLead.entries()].map(([leadId, credits]) => ({ leadId, credits }));
}
