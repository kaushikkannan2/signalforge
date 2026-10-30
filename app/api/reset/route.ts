import { NextResponse } from "next/server";
import { resetDb } from "@/lib/db";
import { resetIds } from "@/lib/ids";
import { suppressHydration } from "@/lib/persist";
import { resetBandit } from "@/lib/rl";
import { emit } from "@/lib/thinking";

/**
 * Returns the workspace to genuinely empty.
 *
 * This exists because a demo that opens with every stage already ticked tells
 * the audience the work is done before it starts. Starting from nothing — and
 * watching each stage tick over as it actually completes — is the whole
 * narrative. So the reset clears entities, the graph, the id counters, the
 * bandit's posteriors and the reasoning trace, and blocks the disk snapshot
 * from rehydrating over the top of it.
 */
export async function POST() {
  resetDb();
  resetIds();
  resetBandit();
  suppressHydration();
  emit("run_reset", "Workspace", "gate", "Workspace reset to empty", {
    detail: "Entities, graph, policy posteriors and trace cleared. Nothing is loaded.",
  });
  return NextResponse.json({ reset: true });
}
