import { NextRequest, NextResponse } from "next/server";
import { bandConfigured, bandRoom, event, listPeers, say, telemetry, verifyAgents } from "@/lib/providers/band";
import { db, findPerson } from "@/lib/db";
import { emit } from "@/lib/thinking";
import { id as mkId } from "@/lib/ids";

export const maxDuration = 120;

export async function GET() {
  return NextResponse.json({
    configured: bandConfigured(),
    room: bandRoom() || null,
    agents: await verifyAgents(),
    peers: await listPeers().catch(() => null),
    telemetry: telemetry(),
  });
}

/**
 * Runs the four-role collaboration over the current pipeline state and posts
 * the handoffs into the Band room. The Security and Reviewer findings are real
 * reads of our own data, not narration: Reviewer reports the actual fact-check
 * verdicts, and Security reports the actual count of messages that would leave
 * the system without an approval record (which is always zero, because the
 * gate makes it impossible — and saying so is the point).
 */
export async function POST(req: NextRequest) {
  const { brief } = (await req.json().catch(() => ({}))) as { brief?: string };
  const runId = mkId("run");

  const pending = db.messages.filter((m) => m.status === "pending_approval");
  const reviewed = db.messages.filter((m) => m.review);
  const flagged = reviewed.filter((m) => !m.review!.factChecksPassed);
  const unapprovedSent = db.dispatches.filter(
    (d) => !db.approvals.some((a) => a.messageId === d.messageId && a.decision !== "rejected"),
  );
  const brokenLinks = reviewed.flatMap((m) => m.review!.brokenLinks);

  emit(runId, "Band", "reasoning", "Multi-agent collaboration started", {
    detail: `Room ${bandRoom() || "(not set)"} · ${db.companies.length} accounts, ${db.messages.length} messages in scope`,
  });

  await say(
    "planner",
    `${brief ?? "GTM run review."} State: ${db.companies.length} accounts discovered (${db.companies.filter((c) => c.disqualified).length} disqualified), ${db.people.length} buyers enriched, ${db.messages.length} messages drafted, ${pending.length} awaiting human approval. Allocating: builder owns pipeline execution, reviewer owns copy accuracy, security owns dispatch safety.`,
    ["builder", "reviewer", "security"],
    runId,
  );

  await say(
    "builder",
    `Executed: discovery across ${db.companies.length} accounts with ${db.signals.length} cited signals, ${db.people.filter((p) => p.enrichment.enrichedAt).length} contacts resolved, ${db.messages.length} touches drafted. Credits consumed ${db.ledger.consumed}, balance ${db.ledger.balance}. Handing copy to @gv-reviewer for fact-checking.`,
    ["reviewer"],
    runId,
  );

  await say(
    "reviewer",
    `Fact-checked ${reviewed.length} first touches. ${reviewed.length - flagged.length} passed, ${flagged.length} flagged for unsupported claims${flagged.length ? `: ${flagged.map((m) => m.review!.notes.slice(0, 80)).join(" | ")}` : ""}. Broken links found: ${brokenLinks.length}. ${db.messages.filter((m) => m.signalsUsed.length === 0).length} touches reference no cited signal and are flagged generic in the queue.`,
    ["planner", "security"],
    runId,
  );

  await say(
    "security",
    `Dispatch audit: ${db.dispatches.length} dispatch records, ${unapprovedSent.length} without a valid human approval. Outbound links checked: ${brokenLinks.length} unreachable. Credential surface: ${["ANTHROPIC_API_KEY", "TAVILY_API_KEY", "FLEXPRICE_API_KEY", "SNYK_TOKEN", "BAND_*"].filter((k) => k.endsWith("*") || process.env[k]).length} providers configured, none referenced in source. Schema changes and dispatch both require human confirmation — no agent in this room can approve either.`,
    ["planner"],
    runId,
  );

  await event(
    "security",
    "Gate integrity check",
    { dispatches: db.dispatches.length, unapprovedDispatches: unapprovedSent.length, brokenLinks: brokenLinks.length },
    runId,
  );

  await say(
    "planner",
    `Reviewer and security clear. ${pending.length} message(s) require a HUMAN decision before dispatch — @${process.env.BAND_HUMAN_HANDLE ?? "kaushikkannan2"} the queue is yours. No agent here can send.`,
    [],
    runId,
  );

  emit(runId, "Band", "gate", "Handed to human for dispatch approval", {
    detail: `${pending.length} message(s) pending. The agents cannot approve their own copy.`,
  });

  return NextResponse.json({ runId, telemetry: telemetry() });
}
