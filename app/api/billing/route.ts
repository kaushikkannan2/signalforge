import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { costPerLead, flexpriceConfigured, topUp } from "@/lib/meter";
import { id as mkId } from "@/lib/ids";

export async function GET() {
  return NextResponse.json({
    ledger: db.ledger,
    events: db.meterEvents.slice(-50).reverse(),
    costPerLead: costPerLead(),
    flexprice: {
      configured: flexpriceConfigured(),
      baseUrl: process.env.FLEXPRICE_BASE_URL ?? null,
      customerId: db.ledger.customerId,
      mirrored: db.meterEvents.filter((e) => e.mirroredToFlexprice).length,
      failed: db.meterEvents.filter((e) => !e.mirroredToFlexprice).length,
    },
  });
}

export async function POST(req: NextRequest) {
  const { credits = 200 } = (await req.json().catch(() => ({}))) as { credits?: number };
  const ledger = topUp(credits, mkId("run"));
  return NextResponse.json({ ledger });
}
