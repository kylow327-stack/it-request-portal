/** Demo auth subjects until OIDC lands. Pass via x-user-id / x-role headers. */
export const DEMO = {
  requester: {
    id: "user-rick",
    email: "rick.business@example.com",
    role: "Requester" as const,
  },
  ba: { id: "user-ba", email: "ba@example.com", role: "BA" as const },
  engineer: {
    id: "user-eng",
    email: "eng@example.com",
    role: "Engineer" as const,
  },
  podLead: {
    id: "user-pod",
    email: "podlead@example.com",
    role: "PodLead" as const,
  },
};

export type DemoActor = {
  userId: string;
  role: "Requester" | "BA" | "Engineer" | "PodLead";
};

export function actorFromHeaders(h: Headers): DemoActor {
  const role = (h.get("x-role") || "Requester") as DemoActor["role"];
  const userId =
    h.get("x-user-id") ||
    (role === "BA"
      ? DEMO.ba.id
      : role === "Engineer"
        ? DEMO.engineer.id
        : role === "PodLead"
          ? DEMO.podLead.id
          : DEMO.requester.id);
  return { userId, role };
}

export function isIt(role: DemoActor["role"]) {
  return role === "BA" || role === "Engineer" || role === "PodLead";
}

export function canOverride(role: DemoActor["role"]) {
  return role === "BA" || role === "PodLead";
}

export function canSetEta(role: DemoActor["role"]) {
  return role === "BA";
}
