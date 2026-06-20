import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";
import { db, storage } from "./firebase";
import { normalizeWorkspace } from "./docStorage";
import type { DocWorkspace, FolderFileRecord } from "../types";

/** Firestore undefined dəyərləri qəbul etmir — yazmadan əvvəl təmizlə */
function stripUndefinedDeep<T>(value: T): T {
  if (value === undefined || value === null) return value;
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as T;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) out[key] = stripUndefinedDeep(v);
    }
    return out as T;
  }
  return value;
}

const SCHEMA_VERSION = 3;

function workspaceDocPath(uid: string): string {
  return `users/${uid}/workspaces/default`;
}

function workspaceDocRef(uid: string) {
  if (!db) throw new Error("Firestore is not configured");
  return doc(db, "users", uid, "workspaces", "default");
}

/** Real-time abunəlik. cb hər dəyişiklikdə çağırılır. exists=false ilkin halı bildirir. */
export function subscribeWorkspace(
  uid: string,
  cb: (snap: { exists: boolean; workspace: DocWorkspace | null; remoteUpdatedAt: number | null }) => void,
): Unsubscribe {
  const ref = workspaceDocRef(uid);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        cb({ exists: false, workspace: null, remoteUpdatedAt: null });
        return;
      }
      const data = snap.data() as { workspace?: DocWorkspace; updatedAt?: { toMillis?: () => number } | number; schemaVersion?: number };
      const ws = (data?.workspace ?? null) as DocWorkspace | null;
      let updatedAt: number | null = null;
      const u = data?.updatedAt as { toMillis?: () => number } | number | undefined;
      if (typeof u === "number") updatedAt = u;
      else if (u && typeof u.toMillis === "function") updatedAt = u.toMillis();
      cb({ exists: true, workspace: ws, remoteUpdatedAt: updatedAt });
    },
    () => {
      cb({ exists: false, workspace: null, remoteUpdatedAt: null });
    },
  );
}

/** İlk dəfə yoxlama (snapshot olmadan): doc varmı? */
export async function fetchWorkspaceOnce(uid: string): Promise<DocWorkspace | null> {
  const ref = workspaceDocRef(uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data() as { workspace?: DocWorkspace };
  return (data?.workspace ?? null) as DocWorkspace | null;
}

export async function writeWorkspace(uid: string, workspace: DocWorkspace): Promise<void> {
  const ref = workspaceDocRef(uid);
  const workspacePayload = stripUndefinedDeep(normalizeWorkspace(workspace));
  await setDoc(
    ref,
    {
      workspace: workspacePayload,
      schemaVersion: SCHEMA_VERSION,
      updatedAt: serverTimestamp(),
    },
    { merge: false },
  );
}

/** Storage helpers */

function storageFolderPath(uid: string, folderId: string, fileId: string, name: string): string {
  // safeName: sade ad, problemli simvolları əvəz et
  const safe = (name || "fayl").replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 80);
  return `users/${uid}/folders/${folderId}/${fileId}-${safe}`;
}

export interface UploadFolderFileResult extends FolderFileRecord {
  storagePath: string;
  url: string;
}

export async function uploadFolderFile(
  uid: string,
  folderId: string,
  file: File,
): Promise<UploadFolderFileResult> {
  if (!storage) throw new Error("Firebase Storage is not configured");
  const id = crypto.randomUUID();
  const path = storageFolderPath(uid, folderId, id, file.name);
  const r = ref(storage, path);
  await uploadBytes(r, file, { contentType: file.type || "application/octet-stream" });
  const url = await getDownloadURL(r);
  return {
    id,
    name: file.name,
    mime: file.type || "application/octet-stream",
    size: file.size,
    createdAt: Date.now(),
    storagePath: path,
    url,
  };
}

export async function deleteStorageFile(storagePath: string): Promise<void> {
  if (!storage) throw new Error("Firebase Storage is not configured");
  const r = ref(storage, storagePath);
  try {
    await deleteObject(r);
  } catch (e: unknown) {
    // Faylın artıq olmaması fatal deyil
    const code = (e as { code?: string })?.code;
    if (code !== "storage/object-not-found") throw e;
  }
}

export { workspaceDocPath };
