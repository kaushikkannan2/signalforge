import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { expandIcp, extractIdentity, inferIcp, summariseIcp } from "@/lib/icp";
import { emit } from "@/lib/thinking";
import { id as mkId, now } from "@/lib/ids";
import { DEMO_INTAKE } from "@/lib/fixtures/demo";
import type { ProductIntake } from "@/lib/types";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Partial<ProductIntake> & {
    useDemoSeed?: boolean;
  };

  const runId = mkId("run");

  // Description-only path: everything else is extracted. The launch screen uses
  // this, because asking a founder to fill six fields that are already in their
  // own paragraph is making them do the parsing.
  if (!body.useDemoSeed && body.description && !body.companyName) {
    const description = body.description.trim();
    if (description.length < 40) {
      return NextResponse.json(
        {
          error:
            "Describe the product in at least a couple of sentences — the ICP is inferred from this text, and a one-liner produces a profile with honestly low confidence.",
        },
        { status: 400 },
      );
    }

    emit(runId, "Intake", "reasoning", "Description received", {
      detail: `${description.length} characters. Company, product and capabilities will be extracted rather than asked for.`,
    });

    try {
      // Identity extraction and the three ICP slices are independent of each
      // other, so they run together and cost one slice of wall-clock, not two.
      const [identity, icp] = await Promise.all([
        extractIdentity(description, runId),
        inferIcp(
          {
            id: mkId("intake"),
            companyName: "",
            productName: "",
            description,
            features: [],
            referenceCustomers: [],
            createdAt: now(),
          },
          runId,
        ),
      ]);

      const intake: ProductIntake = {
        id: mkId("intake"),
        // The honest fields stay honest. `label` is always populated, so the
        // UI has something real to show without the record claiming a name
        // the founder never gave.
        companyName: identity.companyName || identity.label,
        productName: identity.productName || identity.label,
        description,
        features: identity.features,
        referenceCustomers: identity.referenceCustomers,
        pricingModel: identity.pricingModel || undefined,
        averageContractValue: identity.averageContractValue || undefined,
        createdAt: now(),
      };
      db.intakes.push(intake);
      icp.intakeId = intake.id;

      emit(runId, "Intake", "validation", `Identified ${intake.productName} by ${intake.companyName}`, {
        detail: `${intake.features.length} capabilities and ${intake.referenceCustomers.length} reference customers extracted from the description.`,
      });

      void expandIcp(icp, intake, runId).catch((err) => {
        emit(runId, "ICP expansion", "error", "Expansion failed — core ICP is unaffected", {
          detail: err instanceof Error ? err.message : String(err),
        });
        return [];
      });

      return NextResponse.json({
        runId,
        intake,
        icp,
        summary: summariseIcp(icp),
        expansions: [],
        expansionPending: true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      emit(runId, "Intake", "error", "Intake failed", { detail: message });
      return NextResponse.json({ error: message, runId }, { status: 500 });
    }
  }

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

    return NextResponse.json({
      runId,
      intake,
      icp,
      summary: summariseIcp(icp),
      expansions: [],
      expansionPending: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emit(runId, "ICP inference", "error", "ICP inference failed", { detail: message });
    return NextResponse.json({ error: message, runId }, { status: 500 });
  }
}
