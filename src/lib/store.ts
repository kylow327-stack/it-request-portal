import { promises as fs } from "fs";
import path from "path";
import type { AuditEvent, Ticket } from "./types";
import { seedTickets } from "./seed";

/**
 * Local dev writes `data/` when that directory is writable.
 * Vercel serverless cannot write the project directory (EROFS), so when
 * `VERCEL` / `VERCEL_ENV` is set — or a write fails — tickets and audit
 * live in module memory for this instance. `/tmp/it-request-portal` is a
 * secondary file path only when the project dir is read-only and we are
 * not on Vercel.
 */
type Mode = "file" | "memory";

let mode: Mode | null = null;
let ready: Promise<void> | null = null;
let ticketsFile = "";
let auditFile = "";
let memoryTickets: Ticket[] | null = null;
let memoryAudit: AuditEvent[] | null = null;
let announcedMemory = false;

function cloneTickets(tickets: Ticket[]): Ticket[] {
  return structuredClone(tickets);
}

function onVercel(): boolean {
  return Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
}

function fsCode(err: unknown): string | undefined {
  if (!err || typeof err !== "object" || !("code" in err)) return undefined;
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function isFsFailure(err: unknown): boolean {
  const code = fsCode(err);
  return (
    code === "EROFS" ||
    code === "EACCES" ||
    code === "EPERM" ||
    code === "ENOENT" ||
    code === "ENOTDIR" ||
    code === "EISDIR" ||
    code === "ENOSPC" ||
    code === "EBUSY"
  );
}

function activateMemory(tickets?: Ticket[], audit?: AuditEvent[]) {
  mode = "memory";
  if (tickets) memoryTickets = cloneTickets(tickets);
  else if (!memoryTickets) memoryTickets = cloneTickets(seedTickets);
  if (audit) memoryAudit = structuredClone(audit);
  else if (!memoryAudit) memoryAudit = [];
  if (!announcedMemory) {
    announcedMemory = true;
    console.warn(
      "IT Request Portal store is in-memory for this process."
    );
  }
}

async function tryInitDir(dir: string): Promise<boolean> {
  const nextTickets = path.join(dir, "tickets.json");
  const nextAudit = path.join(dir, "audit.jsonl");
  try {
    await fs.mkdir(dir, { recursive: true });
    try {
      await fs.access(nextTickets);
    } catch {
      await fs.writeFile(nextTickets, JSON.stringify(seedTickets, null, 2));
    }
    try {
      await fs.access(nextAudit);
    } catch {
      await fs.writeFile(nextAudit, "");
    }
    const probe = path.join(dir, ".write-probe");
    await fs.writeFile(probe, "ok");
    await fs.rm(probe, { force: true });
    ticketsFile = nextTickets;
    auditFile = nextAudit;
    return true;
  } catch {
    return false;
  }
}

async function selectBackend(): Promise<void> {
  if (onVercel()) {
    activateMemory();
    return;
  }
  const candidates = [
    path.join(process.cwd(), "data"),
    path.join("/tmp", "it-request-portal"),
  ];
  for (const dir of candidates) {
    if (await tryInitDir(dir)) {
      mode = "file";
      return;
    }
  }
  activateMemory();
}

/** Never throws on a read-only filesystem. */
async function ensure(): Promise<void> {
  if (mode) return;
  if (!ready) {
    ready = selectBackend().catch((err) => {
      ready = null;
      console.error(err);
      activateMemory();
    });
  }
  await ready;
}

async function snapshotFiles(): Promise<{ tickets: Ticket[]; audit: AuditEvent[] }> {
  let tickets: Ticket[] = memoryTickets ?? cloneTickets(seedTickets);
  let audit: AuditEvent[] = memoryAudit ? structuredClone(memoryAudit) : [];
  if (ticketsFile) {
    try {
      tickets = JSON.parse(await fs.readFile(ticketsFile, "utf8")) as Ticket[];
    } catch {
      /* keep the in-memory copy */
    }
  }
  if (auditFile) {
    try {
      audit = await readAuditFile();
    } catch {
      /* keep the in-memory copy */
    }
  }
  return { tickets, audit };
}

async function failOverToMemory(tickets: Ticket[], audit: AuditEvent[]) {
  ticketsFile = "";
  auditFile = "";
  activateMemory(tickets, audit);
}

export async function readTickets(): Promise<Ticket[]> {
  await ensure();
  if (mode === "memory") return cloneTickets(memoryTickets ?? seedTickets);
  try {
    const raw = await fs.readFile(ticketsFile, "utf8");
    return JSON.parse(raw) as Ticket[];
  } catch (err) {
    if (!isFsFailure(err)) throw err;
    activateMemory();
    return cloneTickets(memoryTickets ?? seedTickets);
  }
}

export async function writeTickets(tickets: Ticket[]) {
  await ensure();
  if (mode === "memory") {
    memoryTickets = cloneTickets(tickets);
    return;
  }
  try {
    await fs.writeFile(ticketsFile, JSON.stringify(tickets, null, 2));
  } catch (err) {
    if (!isFsFailure(err)) throw err;
    const snap = await snapshotFiles();
    await failOverToMemory(tickets, snap.audit);
  }
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
  if (mode === "memory") {
    memoryAudit = [...(memoryAudit ?? []), event];
    return;
  }
  try {
    await fs.appendFile(auditFile, JSON.stringify(event) + "\n", "utf8");
  } catch (err) {
    if (!isFsFailure(err)) throw err;
    const snap = await snapshotFiles();
    await failOverToMemory(snap.tickets, [...snap.audit, event]);
  }
}

async function readAuditFile(): Promise<AuditEvent[]> {
  const raw = await fs.readFile(auditFile, "utf8");
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as AuditEvent);
}

export async function readAudit(caseId?: string): Promise<AuditEvent[]> {
  await ensure();
  let events: AuditEvent[];
  if (mode === "memory") {
    events = [...(memoryAudit ?? [])];
  } else {
    try {
      events = await readAuditFile();
    } catch (err) {
      if (!isFsFailure(err)) throw err;
      activateMemory();
      events = [...(memoryAudit ?? [])];
    }
  }
  return caseId ? events.filter((e) => e.case_id === caseId) : events;
}

export async function resetStore() {
  const seeded = cloneTickets(seedTickets);
  if (onVercel()) {
    activateMemory(seeded, []);
    return;
  }
  await ensure();
  if (mode === "memory") {
    activateMemory(seeded, []);
    return;
  }
  try {
    await fs.writeFile(ticketsFile, JSON.stringify(seeded, null, 2));
    await fs.writeFile(auditFile, "");
  } catch (err) {
    if (!isFsFailure(err)) throw err;
    await failOverToMemory(seeded, []);
  }
}
