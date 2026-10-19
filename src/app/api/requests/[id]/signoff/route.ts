import { NextRequest, NextResponse } from "next/server";
import { actorFromHeaders } from "@/lib/demo-users";
import { audit } from "@/lib/audit";
import { getTicket, upsertTicket } from "@/lib/store";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const actor = actorFromHeaders(req.headers);
  if (actor.role !== "Requester") {
    return NextResponse.json({ error: "Requester only" }, { status: 403 });
  }
  const ticket = await getTicket(id);
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (ticket.requester_id !== actor.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json();
  const accepted = body.accepted !== false;
  const notes = body.notes ? String(body.notes) : null;
  const now = new Date().toISOString();
  ticket.signoff = {
    notes,
    accepted,
    by_user_id: actor.userId,
    at: now,
  };
  if (accepted) ticket.status = "Closed";
  ticket.updated_at = now;
  await upsertTicket(ticket);
  await audit({
    case_id: id,
    actor_user_id: actor.userId,
    actor_role: "Requester",
    event_type: accepted ? "signoff.accepted" : "signoff.rejected",
    human_action: accepted ? "sign_off_close" : "reject_signoff",
    payload_diff: { notes },
  });
  return NextResponse.json({ ticket });
}
