// IndexedDB-backed outbox for offline writes.
import { openDB, type IDBPDatabase } from "idb";

export type OutboxOp = {
  id: string;
  table: string;
  op: "insert" | "update" | "delete" | "insertMany";
  payload?: any;
  match?: { column: string; value: any };
  createdAt: number;
  attempts: number;
  lastError?: string;
  failed?: boolean;
};

const DB_NAME = "billbook-offline";
const DB_VERSION = 1;
const OUTBOX = "outbox";

let dbPromise: Promise<IDBPDatabase> | null = null;
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
  const db = await getDb();
  const entry: OutboxOp = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    attempts: 0,
    ...op,
  };
  await db.add(OUTBOX, entry);
  notifyOutboxChange();
  return entry;
}

export async function listOutbox(): Promise<OutboxOp[]> {
  const db = await getDb();
  const all = (await db.getAllFromIndex(OUTBOX, "createdAt")) as OutboxOp[];
  return all;
}

export async function countOutbox(): Promise<number> {
  const db = await getDb();
  return db.count(OUTBOX);
}

export async function deleteOutbox(id: string) {
  const db = await getDb();
  await db.delete(OUTBOX, id);
  notifyOutboxChange();
}

export async function clearOutbox() {
  const db = await getDb();
  await db.clear(OUTBOX);
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
