import { NextRequest, NextResponse } from "next/server";
import { actorFromHeaders, isIt } from "@/lib/demo-users";
import { audit } from "@/lib/audit";
import { scorePriority, suggestSlaFromPriority } from "@/lib/scoring";
import {
  emptyOverride,
  emptySignoff,
  type CreateTicketInput,
  type Priority,
} from "@/lib/types";
import { nextRequestId, readTickets, upsertTicket } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const actor = actorFromHeaders(req.headers);
  if (!isIt(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const tickets = await readTickets();
  return NextResponse.json({ tickets });
}

export async function POST(req: NextRequest) {
  const actor = actorFromHeaders(req.headers);
  if (actor.role !== "Requester") {
    return NextResponse.json(
      { error: "Only requester may create" },
      { status: 403 }
    );
  }
  const body = (await req.json()) as CreateTicketInput;
  if (!body.title || body.title.trim().length < 3) {
    return NextResponse.json({ error: "title required (3–120)" }, { status: 400 });
  }
  if (!body.description || body.description.trim().length < 10) {
    return NextResponse.json(
      { error: "description required (10–5000)" },
      { status: 400 }
    );
  }
  const scored = scorePriority(
    body.urgency,
    body.direct_business_impact,
    body.complexity,
    body.business_value
  );
  const now = new Date().toISOString();
  const id = await nextRequestId();
  const ticket = {
    id,
    title: body.title.trim().slice(0, 120),
    description: body.description.trim().slice(0, 5000),
    submitted_at: now,
    expected_delivery: null as string | null,
    sla_suggested_at: suggestSlaFromPriority(scored.band),
    urgency: body.urgency,
    direct_business_impact: body.direct_business_impact,
    complexity: body.complexity,
    business_value: body.business_value,
    priority_band: scored.band as Priority,
    priority_score: scored.total,
    score_breakdown: scored.breakdown,
    status: "PRD / Specs" as const,
    assignee_id: null as string | null,
    assignee_name: null as string | null,
    requester_id: body.requester_id || actor.userId,
    requester_email: body.requester_email,
    intake_channel: body.intake_channel || "form",
    override: emptyOverride(),
    signoff: emptySignoff(),
    created_at: now,
    updated_at: now,
  };
  await upsertTicket(ticket);
  await audit({
    case_id: id,
    actor_user_id: actor.userId,
    actor_role: "Requester",
    event_type: "ticket.created",
    human_action: "submit_request",
    agent_output: null,
    payload_diff: { intake_channel: ticket.intake_channel },
  });
  await audit({
    case_id: id,
    actor_user_id: null,
    actor_role: "System",
    event_type: "priority.scored",
    agent_output: {
      priority_band: scored.band,
      priority_score: scored.total,
      score_breakdown: scored.breakdown,
    },
    human_action: null,
  });
  await audit({
    case_id: id,
    actor_user_id: null,
    actor_role: "System",
    event_type: "eta.suggested",
    agent_output: { sla_suggested_at: ticket.sla_suggested_at },
    human_action: null,
  });
  return NextResponse.json({ ticket }, { status: 201 });
}
