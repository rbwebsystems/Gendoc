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

/** Firestore undefined dəyərləri qəbul etmir; NaN/Infinity də səhvdir */
export function prepareWorkspaceForFirestore(workspace: DocWorkspace): DocWorkspace {
  const normalized = normalizeWorkspace(workspace);
  const withoutHeavyFiles: DocWorkspace = {
    ...normalized,
    folders: (normalized.folders ?? []).map((folder) => ({
      ...folder,
      files: (folder.files ?? [])
        .map((file) => {
          // Storage URL varsa, Firestore-a base64 yazma (1MB limiti və sinxron problemləri)
          if (file.url || file.storagePath) {
            const { dataUrl: _drop, ...meta } = file;
            return meta;
          }
          // Kiçik fayllar üçün dataUrl saxla (legacy / Storage olmayan rejim)
          if (typeof file.dataUrl === "string" && file.dataUrl.length <= 240_000) {
            return file;
          }
          return null;
        })
        .filter((file): file is NonNullable<typeof file> => file != null),
    })),
  };
  const walk = (value: unknown): unknown => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    if (typeof value === "string" || typeof value === "boolean") return value;
    if (Array.isArray(value)) {
      return value.map((item) => walk(item)).filter((item) => item !== undefined);
    }
    if (typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
        const next = walk(v);
        if (next !== undefined) out[key] = next;
      }
      return out;
    }
    return undefined;
  };
  return walk(withoutHeavyFiles) as DocWorkspace;
}

export function workspaceFingerprint(workspace: DocWorkspace): string {
  return JSON.stringify(prepareWorkspaceForFirestore(workspace));
}

const FIRESTORE_DOC_LIMIT_BYTES = 1_048_576;
const FIRESTORE_SAFE_MARGIN_BYTES = 32_768;

function assertFirestorePayloadSize(payload: DocWorkspace): void {
  const bytes = new TextEncoder().encode(JSON.stringify(payload)).length;
  if (bytes + FIRESTORE_SAFE_MARGIN_BYTES > FIRESTORE_DOC_LIMIT_BYTES) {
    throw new Error(
      `Workspace çox böyükdür (${Math.round(bytes / 1024)} KB). Qovluq fayllarını azaldın və ya Storage istifadə edin.`,
    );
  }
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
  const workspacePayload = prepareWorkspaceForFirestore(workspace);
  assertFirestorePayloadSize(workspacePayload);
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

function guessFolderFileMime(file: File): string {
  const t = (file.type || "").trim();
  if (t) return t;
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (/\.(jpe?g|png|gif|webp|bmp|svg)$/.test(lower)) return "image/jpeg";
  return "application/octet-stream";
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
  await uploadBytes(r, file, { contentType: guessFolderFileMime(file) });
  const url = await getDownloadURL(r);
  return {
    id,
    name: file.name,
    mime: guessFolderFileMime(file),
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
