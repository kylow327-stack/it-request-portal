import { NextRequest, NextResponse } from "next/server";
import { actorFromHeaders, isIt } from "@/lib/demo-users";
import { audit } from "@/lib/audit";
import { getTicket, upsertTicket } from "@/lib/store";
import type { Status } from "@/lib/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const actor = actorFromHeaders(req.headers);
  const ticket = await getTicket(id);
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (
    !isIt(actor.role) &&
    ticket.requester_id !== actor.userId &&
    ticket.requester_email !== req.headers.get("x-user-email")
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ ticket });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const actor = actorFromHeaders(req.headers);
  if (!isIt(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const ticket = await getTicket(id);
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json();
  const before = { ...ticket };
  if (typeof body.status === "string") {
    ticket.status = body.status as Status;
  }
  if (typeof body.assignee_name === "string") {
    ticket.assignee_name = body.assignee_name;
    ticket.assignee_id = body.assignee_id ?? ticket.assignee_id;
  }
  // ETA must go through /eta (BA-only)
  if ("expected_delivery" in body) {
    return NextResponse.json(
      { error: "Use PATCH /api/requests/:id/eta (BA only)" },
      { status: 400 }
    );
  }
  if ("priority_band" in body || "priority" in body) {
    return NextResponse.json(
      { error: "Use PATCH /api/requests/:id/priority (BA|PodLead + reason)" },
      { status: 400 }
    );
  }
  ticket.updated_at = new Date().toISOString();
  await upsertTicket(ticket);
  await audit({
    case_id: id,
    actor_user_id: actor.userId,
    actor_role: actor.role,
    event_type:
      before.status !== ticket.status ? "status.changed" : "ticket.updated",
    human_action: "patch_ticket",
    payload_diff: {
      status: before.status !== ticket.status ? [before.status, ticket.status] : undefined,
      assignee_name:
        before.assignee_name !== ticket.assignee_name
          ? [before.assignee_name, ticket.assignee_name]
          : undefined,
    },
  });
  return NextResponse.json({ ticket });
}
