# IT Request Portal — PRD Section 4 (Schemas) v1
Locked defaults: scoring U40/I25/C15/V20 · chat = in-app · override = BA + Pod Lead + note · ETA = BA-set · light theme · Intake build-ready at v0.5.1

## 4.1 Input — Create / update ticket (API body)

```json
{
  "title": "string (required, 3–120)",
  "description": "string (required, 10–5000)",
  "urgency": "P0|P1|P2|P3",
  "urgency_label": "string (UI plain language; optional mirror)",
  "direct_business_impact": true,
  "complexity": "low|med|high",
  "business_value": "low|med|high",
  "intake_channel": "form|chat",
  "chat_transcript_id": "string|null",
  "requester_id": "string (auth subject)",
  "requester_email": "string"
}
```

Chat extract maps into the same fields before `POST /requests` (user must review/submit).

## 4.2 Ticket record (DB / JSON)

```json
{
  "id": "REQ-####",
  "title": "string",
  "description": "string",
  "submitted_at": "ISO-8601",
  "expected_delivery": "YYYY-MM-DD|null",
  "sla_suggested_at": "YYYY-MM-DD|null",
  "urgency": "P0|P1|P2|P3",
  "direct_business_impact": true,
  "complexity": "low|med|high",
  "business_value": "low|med|high",
  "priority_band": "P0|P1|P2|P3",
  "priority_score": 0,
  "score_breakdown": { "urgency": 0, "impact": 0, "complexity": 0, "value": 0 },
  "status": "Intake|PRD / Specs|Delivery|Sign-off|Closed",
  "assignee_id": "string|null",
  "assignee_name": "string|null",
  "requester_id": "string",
  "requester_email": "string",
  "intake_channel": "form|chat",
  "override": {
    "applied": false,
    "from_band": "P1|null",
    "to_band": "P0|null",
    "by_user_id": "string|null",
    "by_role": "BA|PodLead|null",
    "reason": "string|null",
    "at": "ISO-8601|null"
  },
  "signoff": {
    "notes": "string|null",
    "accepted": "boolean|null",
    "by_user_id": "string|null",
    "at": "ISO-8601|null"
  },
  "created_at": "ISO-8601",
  "updated_at": "ISO-8601"
}
```

### Scoring (locked)
- urgency: P0=40, P1=30, P2=18, P3=8
- impact yes=25 / no=8
- complexity: low=15, med=10, high=5
- value: high=20, med=12, low=5
- bands: ≥85→P0, ≥70→P1, ≥50→P2, else P3

### ETA rules
- `sla_suggested_at`: system suggestion from priority band (optional)
- `expected_delivery`: **BA only** may set/confirm; Engineer cannot overwrite without BA change

### Priority override
- Roles: `BA` | `PodLead` only
- Requires non-empty `override.reason`
- Always audited

## 4.3 Output artifacts

### PRD draft (BA workspace)
```json
{
  "ticket_id": "REQ-####",
  "problem": "string",
  "personas": ["string"],
  "process_hitl": ["Intake","AI draft","Rules","HITL","Sign-off","Close"],
  "forbidden_actions": ["string"],
  "kpis": ["cycle_time","override_pct","touch_time"],
  "ready": false,
  "updated_by": "string",
  "updated_at": "ISO-8601"
}
```

### Specs draft (Engineer workspace)
```json
{
  "ticket_id": "REQ-####",
  "stack": "Next.js + TypeScript",
  "apis": ["string"],
  "data_model_refs": ["Ticket","AuditLog"],
  "dod": ["string"],
  "ready": false,
  "updated_by": "string",
  "updated_at": "ISO-8601"
}
```

### Metrics / export row (CSV columns)
`id,title,description,submitted_at,expected_delivery,priority_band,status,assignee_name,requester_email`

### Dashboard
```json
{ "by_status": { "Intake": 0, "PRD / Specs": 0, "Delivery": 0, "Sign-off": 0, "Closed": 0 }, "total": 0 }
```

## 4.4 Audit log (append-only)

Required fields:
```json
{
  "timestamp": "ISO-8601",
  "case_id": "REQ-####",
  "actor_user_id": "string|null",
  "actor_role": "Requester|BA|Engineer|PodLead|System|Agent",
  "event_type": "ticket.created|ticket.updated|priority.scored|priority.overridden|eta.set|eta.suggested|status.changed|prd.updated|specs.updated|export.downloaded|signoff.accepted|signoff.rejected|agent.chat_turn|agent.extract",
  "agent_output": "string|object|null",
  "human_action": "string|null",
  "override_reason": "string|null",
  "user_id": "string|null",
  "payload_diff": "object|null"
}
```

## 4.5 Suggested API surface (minimal)

| Method | Path | Who |
|--------|------|-----|
| POST | `/api/requests` | Requester |
| GET | `/api/me/requests` | Requester |
| GET | `/api/requests` | IT |
| GET | `/api/requests/:id` | Requester (own) / IT |
| PATCH | `/api/requests/:id` | IT (fields by role) |
| PATCH | `/api/requests/:id/eta` | BA |
| PATCH | `/api/requests/:id/priority` | BA, PodLead (+ reason) |
| GET | `/api/metrics/by-status` | IT |
| GET | `/api/requests/export?format=csv` | IT |
| POST | `/api/requests/:id/signoff` | Requester |
| GET/POST | `/api/chat/...` | Requester (in-app) |

Auth: session/OIDC TBD; enforce role gates server-side (never UI-only).

## 4.6 Forbidden (human-only)
Priority override · production deploy approval · access grants · closing without sign-off (or explicit waive logged)
