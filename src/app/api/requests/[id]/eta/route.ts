import { NextRequest, NextResponse } from "next/server";
import { actorFromHeaders, canSetEta } from "@/lib/demo-users";
import { withApi } from "@/lib/api-handler";
import { audit } from "@/lib/audit";
import { getTicket, upsertTicket } from "@/lib/store";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withApi(async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const actor = actorFromHeaders(req.headers);
  if (!canSetEta(actor.role)) {
    return NextResponse.json(
      { error: "BA only may set expected_delivery" },
      { status: 403 }
    );
  }
  const ticket = await getTicket(id);
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json();
  const next =
    body.expected_delivery === null || body.expected_delivery === ""
      ? null
      : String(body.expected_delivery);
  const prev = ticket.expected_delivery;
  ticket.expected_delivery = next;
  ticket.updated_at = new Date().toISOString();
  await upsertTicket(ticket);
  await audit({
    case_id: id,
    actor_user_id: actor.userId,
    actor_role: "BA",
    event_type: "eta.set",
    human_action: "set_expected_delivery",
    payload_diff: { expected_delivery: [prev, next] },
  });
  return NextResponse.json({ ticket });
});
