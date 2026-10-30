import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { expandIcp, inferIcp } from "@/lib/icp";
import { emit } from "@/lib/thinking";
import { id as mkId, now } from "@/lib/ids";
import { DEMO_INTAKE } from "@/lib/fixtures/demo";
import type { ProductIntake } from "@/lib/types";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Partial<ProductIntake> & {
    useDemoSeed?: boolean;
  };

  const intake: ProductIntake = body.useDemoSeed
    ? { ...DEMO_INTAKE, id: mkId("intake"), createdAt: now() }
    : {
        id: mkId("intake"),
        companyName: body.companyName?.trim() || "Untitled Company",
        productName: body.productName?.trim() || "Untitled Product",
        description: body.description?.trim() || "",
        features: (body.features ?? []).filter(Boolean),
        referenceCustomers: (body.referenceCustomers ?? []).filter(Boolean),
        pricingModel: body.pricingModel,
        averageContractValue: body.averageContractValue,
        technicalConstraints: body.technicalConstraints,
        createdAt: now(),
      };

  if (intake.description.length < 40) {
    return NextResponse.json(
      {
        error:
          "Describe the product in at least a couple of sentences — the ICP is inferred from this text, and a one-liner produces a profile with honestly low confidence.",
      },
      { status: 400 },
    );
  }

  db.intakes.push(intake);
  const runId = mkId("run");
  emit(runId, "Intake", "reasoning", `Intake received: ${intake.productName}`, {
    detail: `${intake.description.length} chars, ${intake.features.length} capabilities, ${intake.referenceCustomers.length} reference customers`,
  });

  try {
    const icp = await inferIcp(intake, runId);

    // Expansion deliberately does NOT block this response. It takes about as
    // long as the inference itself, and the operator has something to read and
    // approve the moment the core profile exists — so making them wait for
    // adjacent segments they may dismiss anyway is latency spent on nothing.
    // It runs on, and the client picks it up from /api/icp.
    void expandIcp(icp, intake, runId).catch((err) => {
      emit(runId, "ICP expansion", "error", "Expansion failed — core ICP is unaffected", {
        detail: err instanceof Error ? err.message : String(err),
      });
      return [];
    });

    return NextResponse.json({ runId, intake, icp, expansions: [], expansionPending: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emit(runId, "ICP inference", "error", "ICP inference failed", { detail: message });
    return NextResponse.json({ error: message, runId }, { status: 500 });
  }
}
