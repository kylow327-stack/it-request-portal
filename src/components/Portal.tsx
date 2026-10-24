"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  DRAFT_RESTORED_TOAST,
  clearStoredDraft,
  emptyDraft,
  isPristineSnapshot,
  readStoredDraft,
  sessionStorageOrNull,
  writeStoredDraft,
  type ChatLine,
  type DraftSnapshot,
} from "@/lib/draft-storage";
import {
  draftFieldErrors,
  type DraftFieldErrors,
} from "@/lib/intake-validation";

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

type ToastTone = "success" | "error" | "info";
type ToastState = { text: string; tone: ToastTone };

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

const URGENCY_CHIPS: { label: string; value: Priority; reply: string }[] = [
  { label: "Critical", value: "P0", reply: "Critical — work stopped" },
  { label: "High", value: "P1", reply: "High — needed this week" },
  { label: "Normal", value: "P2", reply: "Normal — planned work" },
  { label: "Low", value: "P3", reply: "Low — nice to have" },
];

const IMPACT_CHIPS: { label: string; value: "yes" | "no"; reply: string }[] = [
  { label: "Yes — direct impact", value: "yes", reply: "Yes" },
  { label: "No — not direct", value: "no", reply: "No" },
];

const COMPLEXITY_HELP =
  "Low = small change (password, access). Medium = known fix or config. High = new build or unknown root cause.";
const VALUE_HELP =
  "High = revenue, customers, or critical ops. Medium = team productivity. Low = nice-to-have polish.";

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
  const [draft, setDraft] = useState<Draft>(() => emptyDraft());
  const [activeId, setActiveId] = useState("REQ-1042");
  const [detailReturn, setDetailReturn] = useState<"my-board" | "it-board">("my-board");
  const [toast, setToast] = useState<ToastState | null>(null);
  const [fieldErrors, setFieldErrors] = useState<DraftFieldErrors>({});
  const [signoffNotes, setSignoffNotes] = useState("");
  const [lastScore, setLastScore] = useState<{
    band: Priority;
    total: number;
    id: string;
  } | null>(null);
  const [chatStep, setChatStep] = useState(0);
  const [chatLog, setChatLog] = useState<ChatLine[]>([]);
  const [chatIn, setChatIn] = useState("");
  const [storageReady, setStorageReady] = useState(false);
  const suppressSave = useRef(false);
  const snapshotRef = useRef<DraftSnapshot>({
    draft,
    chatStep,
    chatLog,
    chatIn,
  });
  snapshotRef.current = { draft, chatStep, chatLog, chatIn };
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

  function showToast(text: string, tone: ToastTone = "success") {
    setToast({ text, tone });
  }

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const storage = sessionStorageOrNull();
    if (storage) {
      const saved = readStoredDraft(storage);
      if (saved && !isPristineSnapshot(saved)) {
        setDraft(saved.draft);
        setChatStep(Math.min(saved.chatStep, chatScript.length));
        setChatLog(saved.chatLog);
        setChatIn(saved.chatIn);
        showToast(DRAFT_RESTORED_TOAST, "info");
      } else if (saved) {
        clearStoredDraft(storage);
      }
    }
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    const storage = sessionStorageOrNull();
    if (!storage) return;
    if (suppressSave.current) {
      suppressSave.current = false;
      clearStoredDraft(storage);
      return;
    }
    const t = window.setTimeout(() => {
      if (suppressSave.current) return;
      const current = sessionStorageOrNull();
      if (!current) return;
      writeStoredDraft(current, snapshotRef.current);
    }, 300);
    return () => window.clearTimeout(t);
  }, [storageReady, draft, chatStep, chatLog, chatIn]);

  useEffect(() => {
    if (!storageReady) return;
    const flush = () => {
      if (suppressSave.current) return;
      const storage = sessionStorageOrNull();
      if (!storage) return;
      writeStoredDraft(storage, snapshotRef.current);
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [storageReady, screen]);

  function discardSavedDraft() {
    suppressSave.current = true;
    const storage = sessionStorageOrNull();
    if (storage) clearStoredDraft(storage);
    setDraft(emptyDraft());
    setChatStep(0);
    setChatLog([]);
    setChatIn("");
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
        showToast(j.error || "ETA save failed", "error");
        return;
      }
      showToast(
        j.ticket.expected_delivery
          ? `BA saved expected delivery ${j.ticket.expected_delivery}`
          : "BA cleared expected delivery",
        "success"
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
        showToast(j.error || "Override failed", "error");
        return;
      }
      showToast(`Priority overridden to ${overrideBand}`, "success");
      setOverrideNote("");
      await reload();
    } finally {
      setBusy(false);
    }
  }

  function validateDraftOrToast(): boolean {
    const errors = draftFieldErrors(draft);
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      showToast("Please fix the highlighted fields before continuing.", "error");
      return false;
    }
    return true;
  }

  function continueToReview() {
    if (!validateDraftOrToast()) return;
    go("review");
  }

  async function submitRequest() {
    if (!validateDraftOrToast()) return;
    setBusy(true);
    try {
      const r = await fetch("/api/requests", {
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
      const j = await r.json();
      if (!r.ok) {
        showToast(j.error || "Submit failed", "error");
        return;
      }
      const t = j.ticket as Ticket;
      setActiveId(t.id);
      setLastScore({
        band: t.priority_band,
        total: t.priority_score,
        id: t.id,
      });
      discardSavedDraft();
      setFieldErrors({});
      showToast(`Request submitted — ${t.id}`, "success");
      setRole("requester");
      setScreen("prio");
      await reload();
    } finally {
      setBusy(false);
    }
  }

  function sendChat(textOverride?: string) {
    const text = (textOverride ?? chatIn).trim();
    if (!text) return;
    const step = chatScript[chatStep];
    const nextDraft = { ...draft, intake_channel: "chat" as const };
    if (step.key === "title") nextDraft.title = text;
    if (step.key === "desc") nextDraft.desc = text;
    if (step.key === "urgency") {
      const chip = URGENCY_CHIPS.find(
        (c) => c.reply === text || c.label === text || c.value === (text as Priority)
      );
      if (chip) nextDraft.urgency = chip.value;
      else {
        const t = text.toUpperCase();
        if (/P0|CRITICAL|STOPPED/.test(t)) nextDraft.urgency = "P0";
        else if (/P1|HIGH/.test(t)) nextDraft.urgency = "P1";
        else if (/P3|LOW|NICE/.test(t)) nextDraft.urgency = "P3";
        else nextDraft.urgency = "P2";
      }
    }
    if (step.key === "impact") {
      const chip = IMPACT_CHIPS.find(
        (c) => c.reply === text || c.label === text || c.value === text.toLowerCase()
      );
      if (chip) nextDraft.impact = chip.value;
      else nextDraft.impact = /^y/i.test(text) ? "yes" : "no";
    }
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
            setFieldErrors({});
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
      showToast("Export failed", "error");
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
      showToast(j.error || "Update failed", "error");
      return;
    }
    await reload();
  }

  async function doSignoff(accepted: boolean) {
    const notes =
      signoffNotes.trim() ||
      (accepted ? "Looks good." : "Needs changes");
    const r = await fetch(`/api/requests/${activeId}/signoff`, {
      method: "POST",
      headers: headersFor("requester"),
      body: JSON.stringify({ accepted, notes }),
    });
    const j = await r.json();
    if (!r.ok) {
      showToast(j.error || "Sign-off failed", "error");
      return;
    }
    setSignoffNotes("");
    await reload();
    if (accepted) {
      showToast("Request signed off and closed", "success");
      go("closed");
    } else {
      showToast("Sent back for changes", "info");
      go("delivery");
    }
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
              <Card icon="📝" title="Fill a request form" body="Structured intake with urgency, impact, complexity, and value." onClick={() => { setFieldErrors({}); go("form"); }} />
              <Card icon="💬" title="Chat with the bot" body="Answer questions; we extract into the form for your check." onClick={() => {
                if (chatLog.length === 0) setDraft((d) => ({ ...d, intake_channel: "chat" }));
                setFieldErrors({});
                go("chat");
              }} />
              <Card icon="📋" title="My tickets board" body="See requests you submitted and their current status." onClick={() => go("my-board")} />
            </div>
            <p className="mt-5 rounded-r-lg border-l-[3px] border-blue-500 bg-blue-50 px-3.5 py-3 text-xs text-blue-950">
              Your answers help IT prioritize. You will review everything before it is submitted.{" "}
              <button
                type="button"
                className="text-blue-700 underline"
                onClick={() =>
                  showToast(
                    "Priority uses urgency, impact, complexity, and value. IT may adjust with a written reason.",
                    "info"
                  )
                }
              >
                How priority works
              </button>
            </p>
          </section>
        )}

        {screen === "form" && (
          <section>
            <Steps on={2} />
            <h1 className="mb-2 text-[26px] font-semibold">New IT request</h1>
            <Panel>
              <Field label="Title" error={fieldErrors.title}>
                <input
                  className={`field ${fieldErrors.title ? "border-red-500" : ""}`}
                  value={draft.title}
                  placeholder="Short summary of what you need"
                  onChange={(e) => {
                    setDraft({ ...draft, title: e.target.value });
                    if (fieldErrors.title) setFieldErrors((fe) => ({ ...fe, title: undefined }));
                  }}
                />
              </Field>
              <Field label="Description" error={fieldErrors.desc}>
                <textarea
                  className={`field min-h-[90px] ${fieldErrors.desc ? "border-red-500" : ""}`}
                  value={draft.desc}
                  placeholder="What is broken or needed? Who is affected? Since when?"
                  onChange={(e) => {
                    setDraft({ ...draft, desc: e.target.value });
                    if (fieldErrors.desc) setFieldErrors((fe) => ({ ...fe, desc: undefined }));
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
                <Field label="Direct business impact?">
                  <select className="field" value={draft.impact} onChange={(e) => setDraft({ ...draft, impact: e.target.value as "yes" | "no" })}>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Complexity" hint={COMPLEXITY_HELP}>
                  <select className="field" value={draft.complexity} onChange={(e) => setDraft({ ...draft, complexity: e.target.value as Draft["complexity"] })}>
                    <option value="low">Low</option>
                    <option value="med">Medium</option>
                    <option value="high">High</option>
                  </select>
                </Field>
                <Field label="Business value" hint={VALUE_HELP}>
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
              {chatScript[chatStep]?.key === "urgency" && (
                <div className="flex flex-wrap gap-2 border-t border-[#d8dee8] px-3 pt-3">
                  {URGENCY_CHIPS.map((chip) => (
                    <button
                      key={chip.value}
                      type="button"
                      className="rounded-lg border border-[#d8dee8] bg-[#eef2f7] px-3 py-1.5 text-sm text-[#1a2332] hover:border-blue-600"
                      onClick={() => sendChat(chip.reply)}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              )}
              {chatScript[chatStep]?.key === "impact" && (
                <div className="flex flex-wrap gap-2 border-t border-[#d8dee8] px-3 pt-3">
                  {IMPACT_CHIPS.map((chip) => (
                    <button
                      key={chip.value}
                      type="button"
                      className="rounded-lg border border-[#d8dee8] bg-[#eef2f7] px-3 py-1.5 text-sm text-[#1a2332] hover:border-blue-600"
                      onClick={() => sendChat(chip.reply)}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2 border-t border-[#d8dee8] p-3">
                <input className="field flex-1" value={chatIn} placeholder="Type your reply…" onChange={(e) => setChatIn(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendChat()} />
                <Primary onClick={() => sendChat()}>Send</Primary>
              </div>
            </div>
            <Actions><Ghost onClick={() => go("landing")}>Back</Ghost></Actions>
          </section>
        )}

        {screen === "review" && (
          <section>
            <Steps on={3} />
            <h1 className="mb-2 text-[26px] font-semibold">Check before submit</h1>
            <Panel>
              <Field label="Title" error={fieldErrors.title}>
                <input
                  className={`field ${fieldErrors.title ? "border-red-500" : ""}`}
                  value={draft.title}
                  onChange={(e) => {
                    setDraft({ ...draft, title: e.target.value });
                    if (fieldErrors.title) setFieldErrors((fe) => ({ ...fe, title: undefined }));
                  }}
                />
              </Field>
              <Field label="Description" error={fieldErrors.desc}>
                <textarea
                  className={`field min-h-[90px] ${fieldErrors.desc ? "border-red-500" : ""}`}
                  value={draft.desc}
                  onChange={(e) => {
                    setDraft({ ...draft, desc: e.target.value });
                    if (fieldErrors.desc) setFieldErrors((fe) => ({ ...fe, desc: undefined }));
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
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Complexity" hint={COMPLEXITY_HELP}>
                  <select className="field" value={draft.complexity} onChange={(e) => setDraft({ ...draft, complexity: e.target.value as Draft["complexity"] })}>
                    <option value="low">Low</option>
                    <option value="med">Medium</option>
                    <option value="high">High</option>
                  </select>
                </Field>
                <Field label="Business value" hint={VALUE_HELP}>
                  <select className="field" value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value as Draft["value"] })}>
                    <option value="high">High</option>
                    <option value="med">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </Field>
              </div>
              <Actions>
                <Ghost onClick={() => go("landing")}>Cancel</Ghost>
                <Success onClick={submitRequest} disabled={busy}>Submit request</Success>
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
              <Primary onClick={() => { discardSavedDraft(); go("form"); }}>New request</Primary>
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
                    <div className="w-full basis-full rounded-lg bg-[#eef2f7] px-3 py-2 text-xs text-[#5b6b82]">
                      {itRole === "BA"
                        ? "Acting as BA — you can set expected delivery and override priority (with a reason)."
                        : itRole === "PodLead"
                          ? "Acting as Pod Lead — you can override priority with a reason. Only BA can set expected delivery."
                          : "Acting as Engineer — ETA and priority override are locked. Switch Act as to BA or Pod Lead to change them."}
                    </div>
                    <label className="self-center text-xs text-[#5b6b82]">BA set ETA</label>
                    <input type="date" className="field w-auto" value={etaInput} onChange={(e) => setEtaInput(e.target.value)} disabled={itRole !== "BA"} />
                    <Primary onClick={saveEta} disabled={busy || itRole !== "BA"}>Save expected delivery</Primary>
                    {itRole !== "BA" && (
                      <span className="self-center text-xs text-amber-800">Only BA can set ETA.</span>
                    )}
                    {active.sla_suggested_at && <Ghost onClick={() => setEtaInput(active.sla_suggested_at!)}>Use SLA suggestion</Ghost>}
                    {active.status === "PRD / Specs" && <Ghost onClick={() => go("workspace")}>Open PRD / Specs workspace</Ghost>}
                    <div className="w-full basis-full" />
                    <Field label="Priority override (BA / Pod Lead — reason required)">
                      <div className="flex flex-wrap gap-2">
                        <select className="field w-auto" value={overrideBand} onChange={(e) => setOverrideBand(e.target.value as Priority)} disabled={itRole !== "BA" && itRole !== "PodLead"}>
                          {(["P0", "P1", "P2", "P3"] as Priority[]).map((p) => <option key={p} value={p}>{p} — {PRIORITY_SHORT[p]}</option>)}
                        </select>
                        <input className="field flex-1" value={overrideNote} placeholder="Mandatory override note" onChange={(e) => setOverrideNote(e.target.value)} disabled={itRole !== "BA" && itRole !== "PodLead"} />
                        <Primary onClick={applyOverride} disabled={busy || (itRole !== "BA" && itRole !== "PodLead")}>Apply override</Primary>
                      </div>
                      {itRole !== "BA" && itRole !== "PodLead" && (
                        <p className="mt-1.5 text-xs text-amber-800">Only BA or Pod Lead can override priority.</p>
                      )}
                    </Field>
                  </>
                )}
                {detailReturn === "my-board" && active.status === "Sign-off" && (
                  <Success onClick={() => { setSignoffNotes(""); go("signoff"); }}>Go to sign-off</Success>
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
                <Primary onClick={async () => { await patchStatus("Sign-off"); setSignoffNotes(""); go("signoff"); }}>Request user sign-off</Primary>
              </Actions>
            </Panel>
          </section>
        )}

        {screen === "signoff" && active && (
          <section>
            <h1 className="mb-2 text-[26px] font-semibold">Requester sign-off</h1>
            <Panel>
              <div className="mb-4 grid grid-cols-[140px_1fr] gap-x-3 gap-y-2 text-sm">
                {([
                  ["Request", `${active.id} — ${active.title}`],
                  ["Description", active.description],
                  ["Expected delivery", active.expected_delivery || "Not set"],
                  ["Priority", `${PRIORITY_SHORT[active.priority_band]} (${active.priority_band})`],
                  ["Status", active.status],
                ] as const).map(([k, v]) => (
                  <div key={k} className="contents"><div className="text-[#5b6b82]">{k}</div><div>{v}</div></div>
                ))}
              </div>
              <Field label="Notes for IT (optional)">
                <textarea
                  className="field min-h-[72px]"
                  value={signoffNotes}
                  placeholder={active.status === "Sign-off" ? "Anything IT should know before you close or send back…" : "Optional notes"}
                  onChange={(e) => setSignoffNotes(e.target.value)}
                />
              </Field>
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

      {toast && (
        <div
          role="status"
          className={`fixed bottom-6 right-6 z-50 max-w-[360px] rounded-[10px] px-4 py-3.5 text-sm text-white shadow-lg ${
            toast.tone === "error"
              ? "bg-red-800"
              : toast.tone === "info"
                ? "bg-slate-800"
                : "bg-green-800"
          }`}
        >
          {toast.text}
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
  const labels = ["1. Entry", "2. Capture", "3. Review & Submit", "4. Priority"];
  return (
    <div className="mb-5 flex flex-wrap gap-1.5 text-[11px] text-[#5b6b82]" aria-label="Request progress">
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

function Field({
  label,
  children,
  hint,
  error,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  error?: string;
}) {
  return (
    <label className="mb-1 mt-3.5 block text-xs text-[#5b6b82]">
      {label}
      <div className="mt-1.5">{children}</div>
      {hint && !error && <p className="mt-1.5 text-[11px] leading-snug text-[#5b6b82]">{hint}</p>}
      {error && <p className="mt-1.5 text-[11px] leading-snug text-red-700">{error}</p>}
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

function Success({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
      {children}
    </button>
  );
}

function Tag({ children, className }: { children: React.ReactNode; className: string }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${className}`}>{children}</span>;
}
