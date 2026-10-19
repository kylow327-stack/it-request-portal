import type { ItRole } from "./types";

export function headersFor(
  view: "requester" | "it",
  itRole: ItRole = "BA"
): HeadersInit {
  if (view === "requester") {
    return { "Content-Type": "application/json", "x-role": "Requester", "x-user-id": "user-rick" };
  }
  return {
    "Content-Type": "application/json",
    "x-role": itRole,
    "x-user-id":
      itRole === "BA" ? "user-ba" : itRole === "PodLead" ? "user-pod" : "user-eng",
  };
}
