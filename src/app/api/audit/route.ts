import { NextRequest, NextResponse } from "next/server";
import { actorFromHeaders, isIt } from "@/lib/demo-users";
import { withApi } from "@/lib/api-handler";
import { readAudit } from "@/lib/store";

export const runtime = "nodejs";

export const GET = withApi(async function GET(req: NextRequest) {
  const actor = actorFromHeaders(req.headers);
  if (!isIt(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const caseId = req.nextUrl.searchParams.get("case_id") || undefined;
  const events = await readAudit(caseId);
  return NextResponse.json({ events });
});
