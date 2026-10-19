import type { ActorRole, AuditEvent } from "./types";
import { appendAudit } from "./store";

export async function audit(opts: {
  case_id: string;
  actor_user_id: string | null;
  actor_role: ActorRole;
  event_type: string;
  agent_output?: string | object | null;
  human_action?: string | null;
  override_reason?: string | null;
  user_id?: string | null;
  payload_diff?: object | null;
}) {
  const event: AuditEvent = {
    timestamp: new Date().toISOString(),
    case_id: opts.case_id,
    actor_user_id: opts.actor_user_id,
    actor_role: opts.actor_role,
    event_type: opts.event_type,
    agent_output: opts.agent_output ?? null,
    human_action: opts.human_action ?? null,
    override_reason: opts.override_reason ?? null,
    user_id: opts.user_id ?? opts.actor_user_id,
    payload_diff: opts.payload_diff ?? null,
  };
  await appendAudit(event);
  return event;
}
