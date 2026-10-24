import type { Draft } from "@/lib/types";

export type DraftFieldErrors = {
  title?: string;
  desc?: string;
};

/** Minimum description length for a useful IT intake. */
export const MIN_DESC_LEN = 10;

export function draftFieldErrors(draft: Draft): DraftFieldErrors {
  const errors: DraftFieldErrors = {};
  if (!draft.title.trim()) {
    errors.title = "Add a short title.";
  }
  if (!draft.desc.trim()) {
    errors.desc = "Describe what you need.";
  } else if (draft.desc.trim().length < MIN_DESC_LEN) {
    errors.desc = `Add a bit more detail (at least ${MIN_DESC_LEN} characters).`;
  }
  return errors;
}

export function draftIsReady(draft: Draft): boolean {
  return Object.keys(draftFieldErrors(draft)).length === 0;
}
