import { NextRequest, NextResponse } from "next/server";
import { actorFromHeaders, DEMO } from "@/lib/demo-users";
import { withApi } from "@/lib/api-handler";
import { readTickets } from "@/lib/store";

export const runtime = "nodejs";

export const GET = withApi(async function GET(req: NextRequest) {
  const actor = actorFromHeaders(req.headers);
  const email =
    actor.role === "Requester"
      ? DEMO.requester.email
      : req.nextUrl.searchParams.get("email") || DEMO.requester.email;
  const tickets = (await readTickets()).filter(
    (t) =>
      t.requester_id === actor.userId || t.requester_email === email
  );
  return NextResponse.json({ tickets });
});
