import { NextRequest, NextResponse } from "next/server";
import { actorFromHeaders, isIt } from "@/lib/demo-users";
import { withApi } from "@/lib/api-handler";
import { audit } from "@/lib/audit";
import { readTickets } from "@/lib/store";

export const runtime = "nodejs";

export const GET = withApi(async function GET(req: NextRequest) {
  const actor = actorFromHeaders(req.headers);
  if (!isIt(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const tickets = await readTickets();
  const headers = [
    "id",
    "title",
    "description",
    "submitted_at",
    "expected_delivery",
    "priority_band",
    "status",
    "assignee_name",
    "requester_email",
  ];
  const lines = [headers.join(",")];
  for (const t of tickets) {
    const row = [
      t.id,
      t.title,
      t.description,
      t.submitted_at,
      t.expected_delivery ?? "",
      t.priority_band,
      t.status,
      t.assignee_name ?? "",
      t.requester_email,
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
    lines.push(row.join(","));
  }
  await audit({
    case_id: "*",
    actor_user_id: actor.userId,
    actor_role: actor.role,
    event_type: "export.downloaded",
    human_action: "export_csv",
  });
  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="it-tickets-export.csv"',
    },
  });
});
