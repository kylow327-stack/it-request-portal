import type { Draft } from "@/lib/types";

/** Tab-scoped draft. v1 includes the form plus chat-intake progress. */
export const DRAFT_STORAGE_KEY = "it-portal-draft-v1";

/** Restore window measured from the last successful write. */
export const DRAFT_TTL_MS = 30 * 60 * 1000;

export const DRAFT_RESTORED_TOAST = "Draft restored (saved for 30 minutes).";

export type ChatLine = { who: "bot" | "user"; text: string };

export type DraftSnapshot = {
  draft: Draft;
  chatStep: number;
  chatLog: ChatLine[];
  chatIn: string;
};

export type StoredDraft = DraftSnapshot & { savedAt: number };

const PRIORITIES = new Set(["P0", "P1", "P2", "P3"]);
const BANDS = new Set(["low", "med", "high"]);

export function emptyDraft(): Draft {
  return {
    title: "",
    desc: "",
    urgency: "P2",
    impact: "yes",
    complexity: "med",
    value: "med",
    intake_channel: "form",
  };
}

export function isPristineSnapshot(snapshot: DraftSnapshot): boolean {
  const blank = emptyDraft();
  const { draft } = snapshot;
  return (
    draft.title === blank.title &&
    draft.desc === blank.desc &&
    draft.urgency === blank.urgency &&
    draft.impact === blank.impact &&
    draft.complexity === blank.complexity &&
    draft.value === blank.value &&
    draft.intake_channel === blank.intake_channel &&
    snapshot.chatStep === 0 &&
    snapshot.chatLog.length === 0 &&
    snapshot.chatIn === ""
  );
}

function isDraft(value: unknown): value is Draft {
  if (!value || typeof value !== "object") return false;
  const d = value as Record<string, unknown>;
  return (
    typeof d.title === "string" &&
    typeof d.desc === "string" &&
    typeof d.urgency === "string" &&
    PRIORITIES.has(d.urgency) &&
    (d.impact === "yes" || d.impact === "no") &&
    typeof d.complexity === "string" &&
    BANDS.has(d.complexity) &&
    typeof d.value === "string" &&
    BANDS.has(d.value) &&
    (d.intake_channel === "form" || d.intake_channel === "chat")
  );
}

function parseChatLog(value: unknown): ChatLine[] {
  if (!Array.isArray(value)) return [];
  const lines: ChatLine[] = [];
  for (const line of value) {
    if (!line || typeof line !== "object") continue;
    const row = line as Record<string, unknown>;
    if ((row.who === "bot" || row.who === "user") && typeof row.text === "string") {
      lines.push({ who: row.who, text: row.text });
    }
  }
  return lines;
}

function parseChatStep(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return 0;
  return Math.min(20, Math.floor(value));
}

function normalizeSnapshot(snapshot: DraftSnapshot): DraftSnapshot {
  return {
    draft: { ...snapshot.draft },
    chatStep: parseChatStep(snapshot.chatStep),
    chatLog: parseChatLog(snapshot.chatLog),
    chatIn: typeof snapshot.chatIn === "string" ? snapshot.chatIn : "",
  };
}

function contentKey(snapshot: DraftSnapshot): string {
  return JSON.stringify({
    draft: snapshot.draft,
    chatStep: snapshot.chatStep,
    chatLog: snapshot.chatLog,
    chatIn: snapshot.chatIn,
  });
}

function parseStored(raw: string, now: number): StoredDraft | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const row = parsed as Record<string, unknown>;
  if (typeof row.savedAt !== "number" || !Number.isFinite(row.savedAt)) return null;
  if (now - row.savedAt >= DRAFT_TTL_MS) return null;
  if (!isDraft(row.draft)) return null;
  return {
    savedAt: row.savedAt,
    draft: {
      title: row.draft.title,
      desc: row.draft.desc,
      urgency: row.draft.urgency,
      impact: row.draft.impact,
      complexity: row.draft.complexity,
      value: row.draft.value,
      intake_channel: row.draft.intake_channel,
    },
    chatStep: parseChatStep(row.chatStep),
    chatLog: parseChatLog(row.chatLog),
    chatIn: typeof row.chatIn === "string" ? row.chatIn : "",
  };
}

export function sessionStorageOrNull(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function readStoredDraft(storage: Storage, now = Date.now()): StoredDraft | null {
  let raw: string | null;
  try {
    raw = storage.getItem(DRAFT_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  const stored = parseStored(raw, now);
  if (!stored) {
    try {
      storage.removeItem(DRAFT_STORAGE_KEY);
    } catch {
      // ignore quota / privacy-mode failures
    }
    return null;
  }
  return stored;
}

export function writeStoredDraft(
  storage: Storage,
  snapshot: DraftSnapshot,
  now = Date.now()
): void {
  const normalized = normalizeSnapshot(snapshot);
  try {
    if (isPristineSnapshot(normalized)) {
      storage.removeItem(DRAFT_STORAGE_KEY);
      return;
    }
    const existingRaw = storage.getItem(DRAFT_STORAGE_KEY);
    if (existingRaw) {
      const existing = parseStored(existingRaw, now);
      if (existing && contentKey(existing) === contentKey(normalized)) return;
    }
    const payload: StoredDraft = { savedAt: now, ...normalized };
    storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota / privacy-mode failures
  }
}

export function clearStoredDraft(storage: Storage): void {
  try {
    storage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // ignore quota / privacy-mode failures
  }
}
