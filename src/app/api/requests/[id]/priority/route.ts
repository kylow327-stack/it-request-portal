import { NextRequest, NextResponse } from "next/server";
import { actorFromHeaders, canOverride } from "@/lib/demo-users";
import { audit } from "@/lib/audit";
import { getTicket, upsertTicket } from "@/lib/store";
import type { Priority } from "@/lib/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const actor = actorFromHeaders(req.headers);
  if (!canOverride(actor.role)) {
    return NextResponse.json(
      { error: "BA or PodLead only" },
      { status: 403 }
    );
  }
  const body = await req.json();
  const reason = String(body.reason || "").trim();
  if (!reason) {
    return NextResponse.json(
      { error: "override.reason is required" },
      { status: 400 }
    );
  }
  const to = body.priority_band as Priority;
  if (!["P0", "P1", "P2", "P3"].includes(to)) {
    return NextResponse.json({ error: "invalid priority_band" }, { status: 400 });
  }
  const ticket = await getTicket(id);
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const from = ticket.priority_band;
  const now = new Date().toISOString();
  ticket.priority_band = to;
  ticket.override = {
    applied: true,
    from_band: from,
    to_band: to,
    by_user_id: actor.userId,
    by_role: actor.role as "BA" | "PodLead",
    reason,
    at: now,
  };
  ticket.updated_at = now;
  await upsertTicket(ticket);
  await audit({
    case_id: id,
    actor_user_id: actor.userId,
    actor_role: actor.role,
    event_type: "priority.overridden",
    human_action: "override_priority",
    override_reason: reason,
    payload_diff: { from_band: from, to_band: to },
  });
  return NextResponse.json({ ticket });
}
