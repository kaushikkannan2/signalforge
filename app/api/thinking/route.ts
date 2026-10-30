import { NextRequest } from "next/server";
import { subscribe } from "@/lib/thinking";
import { db } from "@/lib/db";


/**
 * Server-sent stream of agent reasoning steps. The panel replays the recent
 * backlog on connect so a reload does not lose the trace, then tails live.
 */
export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();
  let unsubscribe = () => {};

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      // Replay the tail so the panel is never blank after a reload.
      for (const step of db.thinking.slice(-120)) send(step);

      unsubscribe = subscribe((step) => {
        try {
          send(step);
        } catch {
          unsubscribe();
        }
      });

      // Heartbeat keeps intermediaries from closing an idle connection.
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          clearInterval(heartbeat);
        }
      }, 15000);

      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
