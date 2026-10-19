export type Priority = "P0" | "P1" | "P2" | "P3";
export type Status =
  | "Intake"
  | "PRD / Specs"
  | "Delivery"
  | "Sign-off"
  | "Closed";
export type Complexity = "low" | "med" | "high";
export type ValueBand = "low" | "med" | "high";
export type IntakeChannel = "form" | "chat";
export type ActorRole =
  | "Requester"
  | "BA"
  | "Engineer"
  | "PodLead"
  | "System"
  | "Agent";
export type ItRole = "BA" | "Engineer" | "PodLead";
export type Role = "requester" | "it";

export type ScoreBreakdown = {
  urgency: number;
  impact: number;
  complexity: number;
  value: number;
};

export type Override = {
  applied: boolean;
  from_band: Priority | null;
  to_band: Priority | null;
  by_user_id: string | null;
  by_role: "BA" | "PodLead" | null;
  reason: string | null;
  at: string | null;
};

export type Signoff = {
  notes: string | null;
  accepted: boolean | null;
  by_user_id: string | null;
  at: string | null;
};

/** Section 4.2 ticket record */
export type Ticket = {
  id: string;
  title: string;
  description: string;
  submitted_at: string;
  expected_delivery: string | null;
  sla_suggested_at: string | null;
  urgency: Priority;
  direct_business_impact: boolean;
  complexity: Complexity;
  business_value: ValueBand;
  priority_band: Priority;
  priority_score: number;
  score_breakdown: ScoreBreakdown;
  status: Status;
  assignee_id: string | null;
  assignee_name: string | null;
  requester_id: string;
  requester_email: string;
  intake_channel: IntakeChannel;
  override: Override;
  signoff: Signoff;
  created_at: string;
  updated_at: string;
};

export type CreateTicketInput = {
  title: string;
  description: string;
  urgency: Priority;
  urgency_label?: string;
  direct_business_impact: boolean;
  complexity: Complexity;
  business_value: ValueBand;
  intake_channel: IntakeChannel;
  chat_transcript_id?: string | null;
  requester_id: string;
  requester_email: string;
};

export type Draft = {
  title: string;
  desc: string;
  urgency: Priority;
  impact: "yes" | "no";
  complexity: Complexity;
  value: ValueBand;
  intake_channel: IntakeChannel;
};

export type AuditEvent = {
  timestamp: string;
  case_id: string;
  actor_user_id: string | null;
  actor_role: ActorRole;
  event_type: string;
  agent_output: string | object | null;
  human_action: string | null;
  override_reason: string | null;
  user_id: string | null;
  payload_diff: object | null;
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  P0: "Critical — work stopped now",
  P1: "High — needed this week",
  P2: "Normal — planned work",
  P3: "Low — nice to have",
};

export const PRIORITY_SHORT: Record<Priority, string> = {
  P0: "Critical",
  P1: "High",
  P2: "Normal",
  P3: "Low",
};

export const emptyOverride = (): Override => ({
  applied: false,
  from_band: null,
  to_band: null,
  by_user_id: null,
  by_role: null,
  reason: null,
  at: null,
});

export const emptySignoff = (): Signoff => ({
  notes: null,
  accepted: null,
  by_user_id: null,
  at: null,
});
