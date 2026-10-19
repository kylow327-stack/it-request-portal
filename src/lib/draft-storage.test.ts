import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DRAFT_STORAGE_KEY,
  DRAFT_TTL_MS,
  clearStoredDraft,
  emptyDraft,
  readStoredDraft,
  writeStoredDraft,
  type DraftSnapshot,
} from "./draft-storage.ts";

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
}

function filledSnapshot(overrides: Partial<DraftSnapshot> = {}): DraftSnapshot {
  return {
    draft: {
      ...emptyDraft(),
      title: "VPN down",
      desc: "Finance cannot connect",
      urgency: "P1",
      impact: "yes",
      complexity: "high",
      value: "high",
      intake_channel: "form",
    },
    chatStep: 0,
    chatLog: [],
    chatIn: "",
    ...overrides,
  };
}

describe("draft storage", () => {
  it("round-trips a draft and chat progress", () => {
    const storage = new MemoryStorage();
    const now = 1_700_000_000_000;
    const snapshot = filledSnapshot({
      chatStep: 2,
      chatLog: [
        { who: "bot", text: "What do you need?" },
        { who: "user", text: "VPN down" },
      ],
      chatIn: "still typing",
      draft: { ...filledSnapshot().draft, intake_channel: "chat" },
    });

    writeStoredDraft(storage, snapshot, now);
    const restored = readStoredDraft(storage, now + 1_000);

    assert.ok(restored);
    assert.equal(restored.savedAt, now);
    assert.deepEqual(restored.draft, snapshot.draft);
    assert.equal(restored.chatStep, 2);
    assert.deepEqual(restored.chatLog, snapshot.chatLog);
    assert.equal(restored.chatIn, "still typing");
  });

  it("restores one millisecond before the 30-minute TTL and drops at the boundary", () => {
    const storage = new MemoryStorage();
    const now = 1_700_000_000_000;
    writeStoredDraft(storage, filledSnapshot(), now);

    const stillValid = readStoredDraft(storage, now + DRAFT_TTL_MS - 1);
    assert.ok(stillValid);
    assert.equal(stillValid.draft.title, "VPN down");

    const expired = readStoredDraft(storage, now + DRAFT_TTL_MS);
    assert.equal(expired, null);
    assert.equal(storage.getItem(DRAFT_STORAGE_KEY), null);
  });

  it("does not extend savedAt when the same snapshot is written again", () => {
    const storage = new MemoryStorage();
    const snapshot = filledSnapshot();
    writeStoredDraft(storage, snapshot, 1_000);
    writeStoredDraft(storage, snapshot, 1_000 + 5 * 60 * 1000);

    const restored = readStoredDraft(storage, 1_000 + 5 * 60 * 1000);
    assert.ok(restored);
    assert.equal(restored.savedAt, 1_000);
  });

  it("does not renew an expired draft when the same snapshot is written again", () => {
    const storage = new MemoryStorage();
    const now = 1_700_000_000_000;
    const snapshot = filledSnapshot();
    writeStoredDraft(storage, snapshot, now);

    const raw = storage.getItem(DRAFT_STORAGE_KEY);
    assert.ok(raw);
    const expiredAt = now - DRAFT_TTL_MS - 1;
    const stored = JSON.parse(raw) as { savedAt: number };
    stored.savedAt = expiredAt;
    storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(stored));

    writeStoredDraft(storage, snapshot, now);
    assert.equal(readStoredDraft(storage, now), null);

    const changed = filledSnapshot({
      draft: { ...snapshot.draft, title: "VPN still down" },
    });
    writeStoredDraft(storage, changed, now);
    const renewed = readStoredDraft(storage, now);
    assert.ok(renewed);
    assert.equal(renewed.savedAt, now);
    assert.equal(renewed.draft.title, "VPN still down");
  });

  it("refreshes savedAt when the draft changes", () => {
    const storage = new MemoryStorage();
    writeStoredDraft(storage, filledSnapshot(), 1_000);
    writeStoredDraft(
      storage,
      filledSnapshot({
        draft: { ...filledSnapshot().draft, title: "VPN still down" },
      }),
      4_000
    );

    const restored = readStoredDraft(storage, 4_000);
    assert.ok(restored);
    assert.equal(restored.savedAt, 4_000);
    assert.equal(restored.draft.title, "VPN still down");
  });

  it("removes storage for a pristine snapshot and for an explicit clear", () => {
    const storage = new MemoryStorage();
    writeStoredDraft(storage, filledSnapshot(), 1_000);
    assert.ok(storage.getItem(DRAFT_STORAGE_KEY));

    writeStoredDraft(
      storage,
      { draft: emptyDraft(), chatStep: 0, chatLog: [], chatIn: "" },
      2_000
    );
    assert.equal(storage.getItem(DRAFT_STORAGE_KEY), null);

    writeStoredDraft(storage, filledSnapshot(), 3_000);
    clearStoredDraft(storage);
    assert.equal(readStoredDraft(storage, 3_000), null);
  });

  it("drops corrupt, expired, and invalid payloads", () => {
    const storage = new MemoryStorage();
    const now = 5_000;

    storage.setItem(DRAFT_STORAGE_KEY, "{");
    assert.equal(readStoredDraft(storage, now), null);
    assert.equal(storage.getItem(DRAFT_STORAGE_KEY), null);

    storage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({ savedAt: now, draft: { title: "missing fields" } })
    );
    assert.equal(readStoredDraft(storage, now), null);
    assert.equal(storage.getItem(DRAFT_STORAGE_KEY), null);

    storage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({
        savedAt: now - DRAFT_TTL_MS - 1,
        draft: filledSnapshot().draft,
      })
    );
    assert.equal(readStoredDraft(storage, now), null);
  });

  it("defaults missing chat fields and ignores junk log lines", () => {
    const storage = new MemoryStorage();
    const now = 9_000;
    storage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({
        savedAt: now,
        draft: filledSnapshot().draft,
        chatLog: [{ who: "bot", text: "Hi" }, { who: "nope", text: "x" }, null],
        chatStep: 2.8,
      })
    );

    const restored = readStoredDraft(storage, now);
    assert.ok(restored);
    assert.deepEqual(restored.chatLog, [{ who: "bot", text: "Hi" }]);
    assert.equal(restored.chatStep, 2);
    assert.equal(restored.chatIn, "");
  });
});
