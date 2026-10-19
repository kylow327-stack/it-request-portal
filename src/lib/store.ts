import { promises as fs } from "fs";
import path from "path";
import type { AuditEvent, Ticket } from "./types";
import { seedTickets } from "./seed";

const dataDir = path.join(process.cwd(), "data");
const ticketsPath = path.join(dataDir, "tickets.json");
const auditPath = path.join(dataDir, "audit.jsonl");

async function ensure() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(ticketsPath);
  } catch {
    await fs.writeFile(ticketsPath, JSON.stringify(seedTickets, null, 2));
  }
  try {
    await fs.access(auditPath);
  } catch {
    await fs.writeFile(auditPath, "");
  }
}

export async function readTickets(): Promise<Ticket[]> {
  await ensure();
  const raw = await fs.readFile(ticketsPath, "utf8");
  return JSON.parse(raw) as Ticket[];
}

export async function writeTickets(tickets: Ticket[]) {
  await ensure();
  await fs.writeFile(ticketsPath, JSON.stringify(tickets, null, 2));
}

export async function getTicket(id: string) {
  const all = await readTickets();
  return all.find((t) => t.id === id) || null;
}

export async function upsertTicket(ticket: Ticket) {
  const all = await readTickets();
  const i = all.findIndex((t) => t.id === ticket.id);
  if (i >= 0) all[i] = ticket;
  else all.unshift(ticket);
  await writeTickets(all);
  return ticket;
}

export async function nextRequestId(): Promise<string> {
  const all = await readTickets();
  let max = 1042;
  for (const t of all) {
    const m = t.id.match(/^REQ-(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `REQ-${max + 1}`;
}

/** Append-only audit — never rewrite history. */
export async function appendAudit(event: AuditEvent) {
  await ensure();
  await fs.appendFile(auditPath, JSON.stringify(event) + "\n", "utf8");
}

export async function readAudit(caseId?: string): Promise<AuditEvent[]> {
  await ensure();
  const raw = await fs.readFile(auditPath, "utf8");
  const lines = raw.split("\n").filter(Boolean);
  const events = lines.map((l) => JSON.parse(l) as AuditEvent);
  return caseId ? events.filter((e) => e.case_id === caseId) : events;
}

export async function resetStore() {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(ticketsPath, JSON.stringify(seedTickets, null, 2));
  await fs.writeFile(auditPath, "");
}
