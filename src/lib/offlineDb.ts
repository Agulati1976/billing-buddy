// IndexedDB-backed outbox for offline writes.
import { openDB, type IDBPDatabase } from "idb";

export type OutboxOp = {
  id: string;
  table: string;
  op: "insert" | "update" | "delete" | "insertMany" | "rpc";
  ownerId?: string;
  businessId?: string;
  payload?: unknown;
  match?: { column: string; value: unknown };
  createdAt: number;
  attempts: number;
  lastError?: string;
  failed?: boolean;
};

const DB_NAME = "billbook-offline";
const DB_VERSION = 1;
const OUTBOX = "outbox";

let dbPromise: Promise<IDBPDatabase> | null = null;
let accountId: string | null = null;
export function setOfflineAccount(userId: string | null) {
  accountId = userId;
  notifyOutboxChange();
}
export function offlineAccount() { return accountId; }
function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(OUTBOX)) {
          const store = db.createObjectStore(OUTBOX, { keyPath: "id" });
          store.createIndex("createdAt", "createdAt");
        }
      },
    });
  }
  return dbPromise;
}

export async function enqueue(op: Omit<OutboxOp, "id" | "createdAt" | "attempts">) {
  const owner=accountId;
  if (!owner) throw new Error("Sign in before saving offline changes");
  const db = await getDb();
  if(accountId!==owner)throw new Error("Account changed before this request could be queued");
  const tx=db.transaction(OUTBOX,"readwrite");
  const last=await tx.store.index("createdAt").openCursor(null,"prev");
  const entry: OutboxOp = {
    id: crypto.randomUUID(),
    createdAt: Math.max(Date.now(),Number(last?.value.createdAt ?? 0)+1),
    attempts: 0,
    ...op,
    ownerId: owner,
  };
  await tx.store.add(entry);
  await tx.done;
  notifyOutboxChange();
  return entry;
}

export async function listOutbox(): Promise<OutboxOp[]> {
  const db = await getDb();
  const all = (await db.getAllFromIndex(OUTBOX, "createdAt")) as OutboxOp[];
  // Legacy entries cannot safely be attributed to any account. Display them for
  // recovery, but never replay them with whichever account signs in next.
  return accountId ? all.filter(op => op.ownerId === accountId || !op.ownerId).map(op => op.ownerId ? op : {...op,failed:true,lastError:"Legacy change has no account identity. Review and re-enter it before discarding."}) : [];
}

export async function countOutbox(): Promise<number> {
  return (await listOutbox()).length;
}

export async function deleteOutbox(id: string) {
  const db = await getDb();
  await db.delete(OUTBOX, id);
  notifyOutboxChange();
}

export async function clearOutbox() {
  const db = await getDb();
  for (const op of await listOutbox()) await db.delete(OUTBOX, op.id);
  notifyOutboxChange();
}

export async function updateOutbox(entry: OutboxOp) {
  const db = await getDb();
  await db.put(OUTBOX, entry);
  notifyOutboxChange();
}

export const OUTBOX_EVENT = "outbox:change";
export function notifyOutboxChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(OUTBOX_EVENT));
  }
}
