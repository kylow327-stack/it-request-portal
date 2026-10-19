import { NextRequest, NextResponse } from "next/server";
import { actorFromHeaders, isIt } from "@/lib/demo-users";
import { readTickets } from "@/lib/store";
import type { Status } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const actor = actorFromHeaders(req.headers);
  if (!isIt(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const tickets = await readTickets();
  const by_status: Record<Status, number> = {
    Intake: 0,
    "PRD / Specs": 0,
    Delivery: 0,
    "Sign-off": 0,
    Closed: 0,
  };
  for (const t of tickets) by_status[t.status] = (by_status[t.status] || 0) + 1;
  return NextResponse.json({ by_status, total: tickets.length });
}
