"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PRIORITY_LABEL,
  PRIORITY_SHORT,
  type Draft,
  type ItRole,
  type Priority,
  type Role,
  type Status,
  type Ticket,
} from "@/lib/types";
import { headersFor } from "@/lib/api-client";
import { DEMO } from "@/lib/demo-users";
import {
  requestFieldErrors,
  type RequestFieldErrors,
} from "@/lib/request-validation";

type Screen =
  | "landing"
  | "form"
  | "chat"
  | "review"
  | "prio"
  | "my-board"
  | "it-board"
  | "ticket-detail"
  | "workspace"
  | "delivery"
  | "signoff"
  | "closed";

const emptyDraft = (): Draft => ({
  title: "",
  desc: "",
  urgency: "P2",
  impact: "yes",
  complexity: "med",
  value: "med",
  intake_channel: "form",
});

const chatScript: { q: string; key: keyof Draft | null }[] = [
  { q: "Hi — in one line, what do you need help with?", key: "title" },
  { q: "Any more detail — who is affected and since when?", key: "desc" },
  {
    q: "How urgent? Critical (work stopped), High (this week), Normal, or Low.",
    key: "urgency",
  },
  {
    q: "Direct business impact (revenue/customers/critical ops)? Yes or No.",
    key: "impact",
  },
  {
    q: "Thanks — I'll open the review form so you can check before submit.",
    key: null,
  },
];

function statusClass(s: Status) {
  return (
    {
      Intake: "bg-blue-100 text-blue-800",
      "PRD / Specs": "bg-purple-100 text-purple-800",
      Delivery: "bg-amber-100 text-amber-900",
      "Sign-off": "bg-teal-100 text-teal-900",
      Closed: "bg-green-100 text-green-800",
    } as Record<Status, string>
  )[s];
}

function prioClass(p: Priority) {
  return (
    {
      P0: "bg-red-100 text-red-800",
      P1: "bg-orange-100 text-orange-800",
      P2: "bg-blue-100 text-blue-800",
      P3: "bg-slate-200 text-slate-700",
    } as Record<Priority, string>
  )[p];
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

export default function Portal() {
  const [role, setRole] = useState<Role>("requester");
  const [itRole, setItRole] = useState<ItRole>("BA");
  const [screen, setScreen] = useState<Screen>("landing");
  const [itTab, setItTab] = useState<"board" | "dash" | "queue" | "audit">("board");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [activeId, setActiveId] = useState("REQ-1042");
  const [detailReturn, setDetailReturn] = useState<"my-board" | "it-board">("my-board");
  const [notice, setNotice] = useState<{
    text: string;
    tone: "success" | "error";
  } | null>(null);
  const [captureAttempted, setCaptureAttempted] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [lastScore, setLastScore] = useState<{
    band: Priority;
    total: number;
    id: string;
  } | null>(null);
  const [chatStep, setChatStep] = useState(0);
  const [chatLog, setChatLog] = useState<{ who: "bot" | "user"; text: string }[]>([]);
  const [chatIn, setChatIn] = useState("");
  const [filter, setFilter] = useState("all");
  const [etaInput, setEtaInput] = useState("");
  const [overrideNote, setOverrideNote] = useState("");
  const [overrideBand, setOverrideBand] = useState<Priority>("P1");
  const [auditEvents, setAuditEvents] = useState<object[]>([]);
  const [dash, setDash] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  const hdr = useCallback(
    () => headersFor(role, itRole),
    [role, itRole]
  );

  const reload = useCallback(async () => {
    const h = headersFor(role, itRole);
    if (role === "requester") {
      const r = await fetch("/api/me/requests", { headers: h });
      const j = await r.json();
      setTickets(j.tickets || []);
    } else {
      const r = await fetch("/api/requests", { headers: h });
      const j = await r.json();
      setTickets(j.tickets || []);
      const m = await fetch("/api/metrics/by-status", { headers: h });
      const mj = await m.json();
      setDash(mj.by_status || {});
    }
  }, [role, itRole]);

  useEffect(() => {
    reload().catch(console.error);
  }, [reload]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(
      () => setNotice(null),
      notice.tone === "error" ? 7000 : 4200
    );
    return () => clearTimeout(t);
  }, [notice]);

  const fieldErrors = useMemo(
    () => requestFieldErrors(draft.title, draft.desc),
    [draft.title, draft.desc]
  );
  const fieldsValid = !fieldErrors.title && !fieldErrors.description;
  const captureErrors: RequestFieldErrors = captureAttempted ? fieldErrors : {};

  function flash(text: string, tone: "success" | "error" = "success") {
    setNotice({ text, tone });
  }

  const active = useMemo(
    () => tickets.find((t) => t.id === activeId),
    [tickets, activeId]
  );

  function go(s: Screen) {
    setScreen(s);
    if (s === "chat" && chatLog.length === 0) {
      setChatLog([{ who: "bot", text: chatScript[0].q }]);
      setChatStep(0);
    }
  }

  function switchRole(next: Role) {
    setRole(next);
    if (next === "it") {
      setScreen("it-board");
      setItTab("board");
    } else setScreen("landing");
  }

  function openDetail(id: string, ret: "my-board" | "it-board") {
    setActiveId(id);
    setDetailReturn(ret);
    const t = tickets.find((x) => x.id === id);
    setEtaInput(t?.expected_delivery || "");
    setOverrideBand(t?.priority_band || "P2");
    setScreen("ticket-detail");
  }

  async function saveEta() {
    setBusy(true);
    try {
      const r = await fetch(`/api/requests/${activeId}/eta`, {
        method: "PATCH",
        headers: hdr(),
        body: JSON.stringify({ expected_delivery: etaInput || null }),
      });
      const j = await r.json();
      if (!r.ok) {
        flash(j.error || "ETA save failed", "error");
        return;
      }
      flash(
        j.ticket.expected_delivery
          ? `BA saved expected delivery ${j.ticket.expected_delivery}`
          : "BA cleared expected delivery"
      );
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function applyOverride() {
    setBusy(true);
    try {
      const r = await fetch(`/api/requests/${activeId}/priority`, {
        method: "PATCH",
        headers: hdr(),
        body: JSON.stringify({
          priority_band: overrideBand,
          reason: overrideNote,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        flash(j.error || "Override failed", "error");
        return;
      }
      flash(`Priority overridden to ${overrideBand}`);
      setOverrideNote("");
      await reload();
    } finally {
      setBusy(false);
    }
  }

  function beginForm() {
    setDraft(emptyDraft());
    setCaptureAttempted(false);
    setConfirmed(false);
    setSubmitError("");
    go("form");
  }

  function beginChat() {
    setDraft({ ...emptyDraft(), intake_channel: "chat" });
    setChatLog([]);
    setChatStep(0);
    setCaptureAttempted(false);
    setConfirmed(false);
    setSubmitError("");
    go("chat");
  }

  function continueToReview() {
    setCaptureAttempted(true);
    const errors = requestFieldErrors(draft.title, draft.desc);
    if (errors.title || errors.description) return;
    setConfirmed(false);
    setSubmitError("");
    go("review");
  }

  function showSubmitFailure(reason: string) {
    setSubmitError(reason);
    flash(reason, "error");
  }

  async function submitRequest() {
    const errors = requestFieldErrors(draft.title, draft.desc);
    if (errors.title || errors.description || !confirmed) {
      showSubmitFailure(
        errors.description ||
          errors.title ||
          "Confirm that you have reviewed this request and the details are accurate."
      );
      return;
    }
    setBusy(true);
    setSubmitError("");
    try {
      let response: Response;
      try {
        response = await fetch("/api/requests", {
          method: "POST",
          headers: headersFor("requester"),
          body: JSON.stringify({
            title: draft.title.trim(),
            description: draft.desc.trim(),
            urgency: draft.urgency,
            direct_business_impact: draft.impact === "yes",
            complexity: draft.complexity,
            business_value: draft.value,
            intake_channel: draft.intake_channel,
            requester_id: DEMO.requester.id,
            requester_email: DEMO.requester.email,
          }),
        });
      } catch {
        showSubmitFailure(
          "Could not reach the server. Check your connection and try again."
        );
        return;
      }

      let payload: { error?: unknown; ticket?: Ticket } = {};
      const raw = await response.text();
      if (raw) {
        try {
          payload = JSON.parse(raw) as { error?: unknown; ticket?: Ticket };
        } catch {
          showSubmitFailure(
            response.ok
              ? "The server response could not be read. Try submitting again."
              : `Submit failed (${response.status}) and the response was not readable.`
          );
          return;
        }
      }
      if (!response.ok) {
        const reason =
          typeof payload.error === "string" && payload.error.trim()
            ? payload.error
            : `Submit failed (${response.status}).`;
        showSubmitFailure(reason);
        return;
      }
      if (!payload.ticket?.id) {
        showSubmitFailure(
          "The server did not return the new request. Try submitting again."
        );
        return;
      }
      const t = payload.ticket;
      setActiveId(t.id);
      setLastScore({
        band: t.priority_band,
        total: t.priority_score,
        id: t.id,
      });
      setConfirmed(false);
      setCaptureAttempted(false);
      flash(`Request submitted — ${t.id}`);
      setRole("requester");
      setScreen("prio");
      await reload();
    } finally {
      setBusy(false);
    }
  }

  function sendChat() {
    const text = chatIn.trim();
    if (!text) return;
    const step = chatScript[chatStep];
    const nextDraft = { ...draft, intake_channel: "chat" as const };
    if (step.key === "title") nextDraft.title = text;
    if (step.key === "desc") nextDraft.desc = text;
    if (step.key === "urgency") {
      const t = text.toUpperCase();
      if (/P0|CRITICAL|STOPPED/.test(t)) nextDraft.urgency = "P0";
      else if (/P1|HIGH/.test(t)) nextDraft.urgency = "P1";
      else if (/P3|LOW|NICE/.test(t)) nextDraft.urgency = "P3";
      else nextDraft.urgency = "P2";
    }
    if (step.key === "impact")
      nextDraft.impact = /^y/i.test(text) ? "yes" : "no";
    setDraft(nextDraft);
    setChatLog((l) => [...l, { who: "user", text }]);
    setChatIn("");
    const next = chatStep + 1;
    setChatStep(next);
    if (next < chatScript.length) {
      setTimeout(() => {
        setChatLog((l) => [...l, { who: "bot", text: chatScript[next].q }]);
        if (!chatScript[next].key) {
          setTimeout(() => {
            setDraft(nextDraft);
            setConfirmed(false);
            setSubmitError("");
            setScreen("review");
          }, 500);
        }
      }, 300);
    }
  }

  async function exportCsv() {
    const r = await fetch("/api/requests/export?format=csv", {
      headers: hdr(),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      flash(
        (j && typeof j.error === "string" && j.error) || "Export failed",
        "error"
      );
      return;
    }
    const blob = await r.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "it-tickets-export.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function loadAudit() {
    const r = await fetch("/api/audit", { headers: hdr() });
    const j = await r.json();
    setAuditEvents(j.events || []);
  }

  async function patchStatus(status: Status) {
    const r = await fetch(`/api/requests/${activeId}`, {
      method: "PATCH",
      headers: hdr(),
      body: JSON.stringify({ status }),
    });
    if (!r.ok) {
      const j = await r.json();
      flash(j.error || "Update failed", "error");
      return;
    }
    await reload();
  }

  async function doSignoff(accepted: boolean) {
    const r = await fetch(`/api/requests/${activeId}/signoff`, {
      method: "POST",
      headers: headersFor("requester"),
      body: JSON.stringify({ accepted, notes: accepted ? "Looks good." : "Needs changes" }),
    });
    const j = await r.json();
    if (!r.ok) {
      flash(j.error || "Sign-off failed", "error");
      return;
    }
    await reload();
    if (accepted) go("closed");
    else go("delivery");
  }

  const mine = tickets.filter(
    (t) =>
      t.requester_email === DEMO.requester.email ||
      t.requester_id === DEMO.requester.id
  );
  const itRows =
    filter === "all" ? tickets : tickets.filter((t) => t.status === filter);
  const statusOrder: Status[] = [
    "Intake",
    "PRD / Specs",
    "Delivery",
    "Sign-off",
    "Closed",
  ];

  return (
    <div className="min-h-screen bg-[#f4f6fa] text-[#1a2332]">
      <header className="flex items-center justify-between border-b border-[#d8dee8] bg-white px-6 py-3">
        <div className="font-bold">
          IT Request <span className="text-blue-600">Portal</span>
        </div>
        <div className="rounded-full bg-blue-100 px-3 py-1 text-[11px] uppercase tracking-wide text-blue-800">
          Next.js + Section 4 APIs — v0.6
        </div>
      </header>

      {role === "requester" ? (
        <p className="border-b border-[#d8dee8] bg-[#e8eef7] px-6 py-1.5 text-[11px] text-[#5b6b82]">
          Demo only:{" "}
          <button type="button" className="text-blue-600 underline" onClick={() => switchRole("it")}>
            Switch to IT view
          </button>{" "}
          · not shown to real business users in production
        </p>
      ) : (
        <nav className="flex flex-wrap items-center gap-2 border-b border-[#d8dee8] bg-[#e8eef7] px-6 py-2.5">
          <button type="button" className="rounded-lg border border-[#d8dee8] px-3 py-1.5 text-sm text-[#5b6b82]" onClick={() => switchRole("requester")}>
            Business User
          </button>
          <button type="button" className="rounded-lg border border-blue-600 bg-blue-600 px-3 py-1.5 text-sm text-white">
            IT (BA / Engineer)
          </button>
          <label className="ml-2 text-xs text-[#5b6b82]">
            Act as{" "}
            <select
              className="field ml-1 w-auto py-1"
              value={itRole}
              onChange={(e) => setItRole(e.target.value as ItRole)}
            >
              <option value="BA">BA</option>
              <option value="PodLead">Pod Lead</option>
              <option value="Engineer">Engineer</option>
            </select>
          </label>
        </nav>
      )}

      <main className="mx-auto max-w-[1100px] px-5 py-7 pb-16">
        {screen === "landing" && (
          <section>
            <Steps on={1} />
            <h1 className="mb-2 text-[26px] font-semibold tracking-tight">How can IT help?</h1>
            <p className="mb-6 text-sm text-[#5b6b82]">Log a request, chat to draft one, or open your ticket board.</p>
            <div className="grid gap-3 md:grid-cols-3">
              <Card icon="📝" title="Fill a request form" body="Structured intake with urgency, impact, complexity, and value." onClick={beginForm} />
              <Card icon="💬" title="Chat with the bot" body="Answer questions; we extract into the form for your check." onClick={beginChat} />
              <Card icon="📋" title="My tickets board" body="See requests you submitted and their current status." onClick={() => go("my-board")} />
            </div>
            <p className="mt-5 rounded-r-lg border-l-[3px] border-amber-500 bg-amber-50 px-3.5 py-3 text-xs text-amber-900">
              Persistence + audit (local disk, in-memory on Vercel). Scoring U40/I25/C15/V20. ETA = BA only. Override = BA|PodLead + note.
            </p>
          </section>
        )}

        {screen === "form" && (
          <section>
            <Steps on={2} />
            <h1 className="mb-2 text-[26px] font-semibold">New IT request</h1>
            <p className="mb-4 text-sm text-[#5b6b82]">Title needs 3–120 characters and the description needs 10–5000 before review.</p>
            <Panel>
              <Field label="Title" hint="3–120 characters" error={captureErrors.title}>
                <input
                  id="request-title"
                  className={fieldClass(Boolean(captureErrors.title))}
                  value={draft.title}
                  placeholder="Short summary of what you need"
                  aria-invalid={Boolean(captureErrors.title)}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />
              </Field>
              <Field label="Description" hint="10–5000 characters" error={captureErrors.description}>
                <textarea
                  id="request-desc"
                  className={fieldClass(Boolean(captureErrors.description), "min-h-[90px]")}
                  value={draft.desc}
                  placeholder="What is broken or needed? Who is affected? Since when?"
                  aria-invalid={Boolean(captureErrors.description)}
                  onChange={(e) => setDraft({ ...draft, desc: e.target.value })}
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="How urgent is this?">
                  <select className="field" value={draft.urgency} onChange={(e) => setDraft({ ...draft, urgency: e.target.value as Priority })}>
                    {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
                      <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Direct business impact?">
                  <select className="field" value={draft.impact} onChange={(e) => setDraft({ ...draft, impact: e.target.value as "yes" | "no" })}>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Complexity">
                  <select className="field" value={draft.complexity} onChange={(e) => setDraft({ ...draft, complexity: e.target.value as Draft["complexity"] })}>
                    <option value="low">Low</option>
                    <option value="med">Medium</option>
                    <option value="high">High</option>
                  </select>
                </Field>
                <Field label="Business value">
                  <select className="field" value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value as Draft["value"] })}>
                    <option value="high">High</option>
                    <option value="med">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </Field>
              </div>
              <Actions>
                <Ghost onClick={() => go("landing")}>Back</Ghost>
                <Primary onClick={continueToReview}>Continue to review</Primary>
              </Actions>
            </Panel>
          </section>
        )}

        {screen === "chat" && (
          <section>
            <Steps on={2} />
            <h1 className="mb-2 text-[26px] font-semibold">Chat intake</h1>
            <div className="flex h-[400px] flex-col overflow-hidden rounded-xl border border-[#d8dee8] bg-white">
              <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-4">
                {chatLog.map((b, i) => (
                  <div key={i} className={`max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm leading-snug ${b.who === "bot" ? "self-start bg-[#eef2f7]" : "self-end bg-blue-600 text-white"}`}>{b.text}</div>
                ))}
              </div>
              <div className="flex gap-2 border-t border-[#d8dee8] p-3">
                <input className="field flex-1" value={chatIn} placeholder="Type your reply…" onChange={(e) => setChatIn(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendChat()} />
                <Primary onClick={sendChat}>Send</Primary>
              </div>
            </div>
            <Actions><Ghost onClick={() => go("landing")}>Back</Ghost></Actions>
          </section>
        )}

        {screen === "review" && (
          <section>
            <Steps on={3} />
            <h1 className="mb-2 text-[26px] font-semibold">Check before submit</h1>
            <p className="mb-4 text-sm text-[#5b6b82]">Edit the title or description if needed. Submit stays off until the details pass the checks and you confirm they are accurate.</p>
            <Panel>
              <Field label="Title" hint="3–120 characters" error={fieldErrors.title}>
                <input
                  id="review-title"
                  className={fieldClass(Boolean(fieldErrors.title))}
                  value={draft.title}
                  aria-invalid={Boolean(fieldErrors.title)}
                  onChange={(e) => {
                    setSubmitError("");
                    setDraft({ ...draft, title: e.target.value });
                  }}
                />
              </Field>
              <Field label="Description" hint="10–5000 characters" error={fieldErrors.description}>
                <textarea
                  id="review-desc"
                  className={fieldClass(Boolean(fieldErrors.description), "min-h-[90px]")}
                  value={draft.desc}
                  aria-invalid={Boolean(fieldErrors.description)}
                  onChange={(e) => {
                    setSubmitError("");
                    setDraft({ ...draft, desc: e.target.value });
                  }}
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="How urgent is this?">
                  <select className="field" value={draft.urgency} onChange={(e) => setDraft({ ...draft, urgency: e.target.value as Priority })}>
                    {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
                      <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Direct business impact">
                  <select className="field" value={draft.impact} onChange={(e) => setDraft({ ...draft, impact: e.target.value as "yes" | "no" })}>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </Field>
              </div>
              <label className={`mt-4 flex items-start gap-2.5 rounded-lg border px-3 py-3 text-sm ${confirmed ? "border-green-600 bg-green-50" : "border-[#d8dee8] bg-[#f8fafc]"}`}>
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                <span>
                  <span className="font-medium text-[#1a2332]">I have reviewed this request and the details are accurate.</span>
                  <span className="mt-0.5 block text-xs text-[#5b6b82]">Required before Submit is enabled.</span>
                </span>
              </label>
              {!fieldsValid && (
                <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-800">
                  <p className="font-medium">Submit is unavailable until these are fixed.</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {fieldErrors.title && <li>{fieldErrors.title}</li>}
                    {fieldErrors.description && <li>{fieldErrors.description}</li>}
                  </ul>
                </div>
              )}
              {fieldsValid && !confirmed && (
                <p className="mt-3 text-sm text-[#5b6b82]">Check the confirmation above to enable Submit.</p>
              )}
              {submitError && (
                <div role="alert" className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3.5 py-3 text-sm font-medium text-red-800">
                  {submitError}
                </div>
              )}
              <Actions>
                <Ghost onClick={() => go("landing")}>Cancel</Ghost>
                <Success
                  onClick={submitRequest}
                  disabled={busy || !confirmed || !fieldsValid}
                  title={
                    !fieldsValid
                      ? fieldErrors.description || fieldErrors.title
                      : !confirmed
                        ? "Confirm that you have reviewed this request and the details are accurate."
                        : undefined
                  }
                >
                  {busy ? "Submitting…" : "Submit request"}
                </Success>
              </Actions>
            </Panel>
          </section>
        )}

        {screen === "prio" && lastScore && (
          <section>
            <Steps on={4} />
            <h1 className="mb-2 text-[26px] font-semibold">Prioritization result</h1>
            <Panel>
              <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(["P0", "P1", "P2", "P3"] as Priority[]).map((p) => (
                  <div key={p} className={`rounded-xl bg-[#eef2f7] p-3 text-center ${p === lastScore.band ? "border-2 border-blue-600" : ""}`}>
                    <div className="text-lg font-bold">{PRIORITY_SHORT[p]}</div>
                    <div className="text-[11px] text-[#5b6b82]">{p}</div>
                  </div>
                ))}
              </div>
              <div className="rounded-lg bg-[#eef2f7] p-3.5 text-sm text-[#5b6b82]">
                <strong className="text-[#1a2332]">Priority: {PRIORITY_SHORT[lastScore.band]} ({lastScore.band})</strong>{" "}
                (score {lastScore.total}/100)
                <br />Created {lastScore.id}. Track it on My tickets.
              </div>
              <Actions><Ghost onClick={() => go("my-board")}>My tickets board</Ghost></Actions>
            </Panel>
          </section>
        )}

        {screen === "my-board" && (
          <section>
            <h1 className="mb-2 text-[26px] font-semibold">My tickets</h1>
            <div className="mb-3 flex justify-between gap-2">
              <Ghost onClick={() => go("landing")}>← Home</Ghost>
              <Primary onClick={beginForm}>New request</Primary>
            </div>
            <TicketTable rows={mine} onRow={(id) => openDetail(id, "my-board")} />
          </section>
        )}

        {screen === "it-board" && (
          <section>
            <h1 className="mb-2 text-[26px] font-semibold">IT operations board</h1>
            <div className="mb-3.5 flex flex-wrap gap-1.5">
              {([["board", "Ticket board"], ["dash", "Dashboard"], ["queue", "PRD / Specs queue"], ["audit", "Audit log"]] as const).map(([k, label]) => (
                <button key={k} type="button" className={`rounded-lg border px-3 py-1.5 text-sm ${itTab === k ? "border-blue-600 bg-[#eef2f7] text-[#1a2332]" : "border-[#d8dee8] text-[#5b6b82]"}`}
                  onClick={() => { setItTab(k); if (k === "audit") loadAudit(); }}>
                  {label}
                </button>
              ))}
            </div>
            {itTab === "board" && (
              <>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <select className="field w-auto" value={filter} onChange={(e) => setFilter(e.target.value)}>
                    <option value="all">All statuses</option>
                    {statusOrder.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <Ghost onClick={exportCsv}>Export CSV</Ghost>
                </div>
                <TicketTable rows={itRows} showDesc onRow={(id) => openDetail(id, "it-board")} />
              </>
            )}
            {itTab === "dash" && (
              <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:grid-cols-6">
                {statusOrder.map((s) => (
                  <div key={s} className="rounded-[10px] bg-[#eef2f7] p-3.5 text-center">
                    <div className="text-[22px] font-bold">{dash[s] ?? 0}</div>
                    <div className="mt-1 text-[11px] text-[#5b6b82]">{s}</div>
                  </div>
                ))}
                <div className="rounded-[10px] bg-[#eef2f7] p-3.5 text-center">
                  <div className="text-[22px] font-bold">{tickets.length}</div>
                  <div className="mt-1 text-[11px] text-[#5b6b82]">Total</div>
                </div>
              </div>
            )}
            {itTab === "queue" && (
              <Panel className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead><tr className="text-[#5b6b82]"><th className="p-2 font-medium">ID</th><th className="p-2 font-medium">Title</th><th className="p-2 font-medium">Priority</th><th className="p-2 font-medium" /></tr></thead>
                  <tbody>
                    {tickets.filter((t) => t.status === "PRD / Specs").map((t) => (
                      <tr key={t.id} className="border-t border-[#d8dee8]">
                        <td className="p-2">{t.id}</td>
                        <td className="p-2">{t.title}</td>
                        <td className="p-2"><Tag className={prioClass(t.priority_band)}>{PRIORITY_SHORT[t.priority_band]}</Tag></td>
                        <td className="p-2"><Primary onClick={() => { setActiveId(t.id); go("workspace"); }}>Open</Primary></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            )}
            {itTab === "audit" && (
              <Panel className="max-h-[420px] overflow-auto">
                <pre className="whitespace-pre-wrap font-mono text-[11px] text-[#5b6b82]">
                  {auditEvents.length ? JSON.stringify(auditEvents.slice().reverse().slice(0, 40), null, 2) : "No audit events yet — create a ticket or set ETA."}
                </pre>
              </Panel>
            )}
          </section>
        )}

        {screen === "ticket-detail" && active && (
          <section>
            <h1 className="mb-2 text-[26px] font-semibold">{active.id} — {active.title}</h1>
            <Panel>
              <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-2 text-sm">
                {([
                  ["Description", active.description],
                  ["Submitted", fmtDate(active.submitted_at)],
                  ["Expected delivery", active.expected_delivery || "Not set"],
                  ["SLA suggested", active.sla_suggested_at || "—"],
                  ["Priority", `${PRIORITY_SHORT[active.priority_band]} (${active.priority_band}) · score ${active.priority_score}`],
                  ["Status", active.status],
                  ["Assignee", active.assignee_name || "Unassigned"],
                  ["Requester", active.requester_email],
                ] as const).map(([k, v]) => (
                  <div key={k} className="contents"><div className="text-[#5b6b82]">{k}</div><div>{v}</div></div>
                ))}
              </div>
              <Actions>
                <Ghost onClick={() => go(detailReturn)}>← {detailReturn === "it-board" ? "IT board" : "My board"}</Ghost>
                {detailReturn === "it-board" && (
                  <>
                    <label className="self-center text-xs text-[#5b6b82]">BA set ETA</label>
                    <input type="date" className="field w-auto" value={etaInput} onChange={(e) => setEtaInput(e.target.value)} />
                    <Primary onClick={saveEta} disabled={busy || itRole !== "BA"}>Save expected delivery</Primary>
                    {active.sla_suggested_at && <Ghost onClick={() => setEtaInput(active.sla_suggested_at!)}>Use SLA suggestion</Ghost>}
                    {active.status === "PRD / Specs" && <Ghost onClick={() => go("workspace")}>Open PRD / Specs workspace</Ghost>}
                    <div className="w-full basis-full" />
                    <Field label="Priority override (BA / Pod Lead — reason required)">
                      <div className="flex flex-wrap gap-2">
                        <select className="field w-auto" value={overrideBand} onChange={(e) => setOverrideBand(e.target.value as Priority)}>
                          {(["P0", "P1", "P2", "P3"] as Priority[]).map((p) => <option key={p} value={p}>{p} — {PRIORITY_SHORT[p]}</option>)}
                        </select>
                        <input className="field flex-1" value={overrideNote} placeholder="Mandatory override note" onChange={(e) => setOverrideNote(e.target.value)} />
                        <Primary onClick={applyOverride} disabled={busy || (itRole !== "BA" && itRole !== "PodLead")}>Apply override</Primary>
                      </div>
                    </Field>
                  </>
                )}
                {detailReturn === "my-board" && active.status === "Sign-off" && (
                  <Success onClick={() => go("signoff")}>Go to sign-off</Success>
                )}
              </Actions>
            </Panel>
          </section>
        )}

        {screen === "workspace" && active && (
          <section>
            <h1 className="mb-2 text-[26px] font-semibold">{active.id} — workspace</h1>
            <div className="grid gap-4 md:grid-cols-2">
              <Panel>
                <h2 className="mb-2 text-base font-semibold">PRD (BA)</h2>
                <pre className="max-h-44 overflow-y-auto whitespace-pre-wrap rounded-lg bg-[#eef2f7] p-3 font-mono text-xs text-[#5b6b82]">{`# PRD — ${active.title}\n## Problem\n${active.description}\n## Priority\n${active.priority_band}`}</pre>
              </Panel>
              <Panel>
                <h2 className="mb-2 text-base font-semibold">Specs (Engineer)</h2>
                <pre className="max-h-44 overflow-y-auto whitespace-pre-wrap rounded-lg bg-[#eef2f7] p-3 font-mono text-xs text-[#5b6b82]">{`# Specs — ${active.id}\n## APIs\nPOST /api/requests\nPATCH .../eta (BA)\nPATCH .../priority (BA|PodLead)\n## Audit\ntimestamp, case_id, agent_output, human_action, override_reason, user_id`}</pre>
              </Panel>
            </div>
            <Actions>
              <Ghost onClick={() => { setItTab("queue"); go("it-board"); }}>Back</Ghost>
              <Primary onClick={async () => { await patchStatus("Delivery"); go("delivery"); }}>Push to delivery</Primary>
            </Actions>
          </section>
        )}

        {screen === "delivery" && active && (
          <section>
            <h1 className="mb-2 text-[26px] font-semibold">Delivery in progress</h1>
            <Panel>
              <p><strong>{active.id}</strong> — {active.title}<br /><span className="text-sm text-[#5b6b82]">ETA: {active.expected_delivery || "TBD"} · Status: {active.status}</span></p>
              <Actions>
                <Primary onClick={async () => { await patchStatus("Sign-off"); go("signoff"); }}>Request user sign-off</Primary>
              </Actions>
            </Panel>
          </section>
        )}

        {screen === "signoff" && (
          <section>
            <h1 className="mb-2 text-[26px] font-semibold">Requester sign-off</h1>
            <Panel>
              <Actions>
                <Ghost onClick={() => doSignoff(false)}>Needs changes</Ghost>
                <Success onClick={() => doSignoff(true)}>Sign off & close</Success>
              </Actions>
            </Panel>
          </section>
        )}

        {screen === "closed" && (
          <section>
            <h1 className="mb-2 text-[26px] font-semibold">Request closed</h1>
            <Panel>
              <p className="font-semibold text-green-700">✓ Closed</p>
              <Actions>
                <Ghost onClick={() => go("my-board")}>My board</Ghost>
                <Primary onClick={() => switchRole("it")}>IT board</Primary>
              </Actions>
            </Panel>
          </section>
        )}
      </main>

      {notice && (
        <div
          role={notice.tone === "error" ? "alert" : "status"}
          className={`fixed bottom-6 right-6 z-50 max-w-[360px] rounded-[10px] px-4 py-3.5 text-sm text-white shadow-lg ${notice.tone === "error" ? "bg-red-800" : "bg-green-800"}`}
        >
          {notice.text}
        </div>
      )}
    </div>
  );
}

function TicketTable({
  rows,
  onRow,
  showDesc,
}: {
  rows: Ticket[];
  onRow: (id: string) => void;
  showDesc?: boolean;
}) {
  return (
    <Panel className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-[#5b6b82]">
            <th className="p-2 font-medium">ID</th>
            <th className="p-2 font-medium">{showDesc ? "Title / description" : "Title"}</th>
            <th className="p-2 font-medium">Submitted</th>
            <th className="p-2 font-medium">Expected delivery</th>
            <th className="p-2 font-medium">Priority</th>
            <th className="p-2 font-medium">Status</th>
            <th className="p-2 font-medium">Assignee</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} className="cursor-pointer border-t border-[#d8dee8] hover:bg-[#eef2f7]" onClick={() => onRow(t.id)}>
              <td className="p-2">{t.id}</td>
              <td className="p-2">
                <div>{t.title}</div>
                {showDesc && <div className="max-w-[220px] truncate text-[#5b6b82]">{t.description}</div>}
              </td>
              <td className="p-2">{fmtDate(t.submitted_at)}</td>
              <td className="p-2">{t.expected_delivery || "—"}</td>
              <td className="p-2"><Tag className={prioClass(t.priority_band)}>{PRIORITY_SHORT[t.priority_band]}</Tag></td>
              <td className="p-2"><Tag className={statusClass(t.status)}>{t.status}</Tag></td>
              <td className="p-2">{t.assignee_name || "Unassigned"}</td>
            </tr>
          ))}
          {!rows.length && (
            <tr><td colSpan={7} className="p-2 text-[#5b6b82]">No tickets yet.</td></tr>
          )}
        </tbody>
      </table>
    </Panel>
  );
}

function Steps({ on }: { on: number }) {
  const labels = ["1. Entry", "2. Capture", "3. Review & Submit", "4. Prioritize", "5. Boards / PRD", "6. Delivery", "7. Sign-off"];
  return (
    <div className="mb-5 flex flex-wrap gap-1.5 text-[11px] text-[#5b6b82]">
      {labels.map((l, i) => (
        <span key={l} className={`rounded-md px-2 py-1 ${i + 1 === on ? "bg-blue-100 text-blue-800" : i + 1 < on ? "bg-green-100 text-green-800" : "bg-[#eef2f7]"}`}>{l}</span>
      ))}
    </div>
  );
}

function Card({ icon, title, body, onClick }: { icon: string; title: string; body: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-xl border border-[#d8dee8] bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-blue-600">
      <div className="mb-2 text-[26px]">{icon}</div>
      <h3 className="mb-1.5 text-[15px] font-semibold">{title}</h3>
      <p className="text-[13px] leading-snug text-[#5b6b82]">{body}</p>
    </button>
  );
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-[#d8dee8] bg-white p-5 ${className}`}>{children}</div>;
}

function fieldClass(invalid: boolean, extra = "") {
  return ["field", extra, invalid ? "invalid" : ""].filter(Boolean).join(" ");
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="mb-1 mt-3.5 block text-xs text-[#5b6b82]">
      {label}
      {hint && <span className="mt-0.5 block">{hint}</span>}
      <div className="mt-1.5">{children}</div>
      {error && (
        <span role="alert" className="mt-1.5 block text-xs font-medium text-red-700">
          {error}
        </span>
      )}
    </label>
  );
}

function Actions({ children }: { children: React.ReactNode }) {
  return <div className="mt-4 flex flex-wrap items-center gap-2.5">{children}</div>;
}

function Primary({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm text-white disabled:opacity-50">
      {children}
    </button>
  );
}

function Ghost({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-lg border border-[#d8dee8] bg-transparent px-4 py-2.5 text-sm text-[#5b6b82]">
      {children}
    </button>
  );
}

function Success({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button type="button" disabled={disabled} title={title} onClick={onClick} className="rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
      {children}
    </button>
  );
}

function Tag({ children, className }: { children: React.ReactNode; className: string }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${className}`}>{children}</span>;
}
