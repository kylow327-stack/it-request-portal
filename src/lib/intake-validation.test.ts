import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyDraft } from "./draft-storage.ts";
import { draftFieldErrors, draftIsReady, MIN_DESC_LEN } from "./intake-validation.ts";

describe("draftFieldErrors", () => {
  it("requires title and description", () => {
    const errors = draftFieldErrors(emptyDraft());
    assert.equal(errors.title, "Add a short title.");
    assert.equal(errors.desc, "Describe what you need.");
    assert.equal(draftIsReady(emptyDraft()), false);
  });

  it("rejects short descriptions", () => {
    const draft = { ...emptyDraft(), title: "VPN down", desc: "broken" };
    const errors = draftFieldErrors(draft);
    assert.match(errors.desc || "", new RegExp(String(MIN_DESC_LEN)));
  });

  it("accepts a complete draft", () => {
    const draft = {
      ...emptyDraft(),
      title: "VPN down for sales",
      desc: "Sales team cannot connect since 9am; about 12 people blocked.",
    };
    assert.deepEqual(draftFieldErrors(draft), {});
    assert.equal(draftIsReady(draft), true);
  });
});
