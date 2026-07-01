import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import { normalizeWorkspace, workspaceHasUserData } from "./docStorage";
import {
  assertFirestorePayloadSize,
  fetchWorkspaceOnce,
  prepareWorkspaceForFirestore,
  workspaceFingerprint,
} from "./workspaceSync";
import type { DocWorkspace, SystemUserRecord } from "../types";
import type { AppUserRole, PermissionModuleId } from "../types";
import { defaultModulesForRole } from "./defaults";

export const ORG_ID = "default";
const SCHEMA_VERSION = 3;

function orgWorkspaceRef() {
  if (!db) throw new Error("Firestore is not configured");
  return doc(db, "orgs", ORG_ID, "workspace", "default");
}

function orgMemberRef(uid: string) {
  if (!db) throw new Error("Firestore is not configured");
  return doc(db, "orgs", ORG_ID, "members", uid);
}

function orgMembersCol() {
  if (!db) throw new Error("Firestore is not configured");
  return collection(db, "orgs", ORG_ID, "members");
}

export function normalizeUsernameKey(username: string): string {
  return username
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9._-]/g, "");
}

function orgUsernameRef(normalizedUsername: string) {
  if (!db) throw new Error("Firestore is not configured");
  return doc(db, "orgs", ORG_ID, "usernames", normalizedUsername);
}

export async function fetchAuthEmailByUsername(username: string): Promise<string | null> {
  if (!db) return null;
  const key = normalizeUsernameKey(username);
  if (!key) return null;
  const snap = await getDoc(orgUsernameRef(key));
  if (!snap.exists()) return null;
  const authEmail = (snap.data() as { authEmail?: string }).authEmail;
  return typeof authEmail === "string" && authEmail.trim() ? authEmail.trim() : null;
}

export async function isUsernameTaken(username: string, exceptUid?: string): Promise<boolean> {
  if (!db) return false;
  const key = normalizeUsernameKey(username);
  if (!key) return true;
  const snap = await getDoc(orgUsernameRef(key));
  if (!snap.exists()) return false;
  const uid = (snap.data() as { uid?: string }).uid;
  return uid !== exceptUid;
}

export async function writeUsernameIndex(username: string, uid: string, authEmail: string): Promise<void> {
  const key = normalizeUsernameKey(username);
  if (!key) throw new Error("İstifadəçi adı düzgün deyil.");
  await setDoc(orgUsernameRef(key), { uid, authEmail, updatedAt: Date.now() });
}

export async function deleteUsernameIndex(username: string): Promise<void> {
  if (!db) return;
  const key = normalizeUsernameKey(username);
  if (!key) return;
  try {
    await deleteDoc(orgUsernameRef(key));
  } catch {
    /* ignore */
  }
}

export async function syncUsernameIndex(
  oldUsername: string | undefined,
  newUsername: string,
  uid: string,
  authEmail: string,
): Promise<void> {
  const oldKey = oldUsername ? normalizeUsernameKey(oldUsername) : "";
  const newKey = normalizeUsernameKey(newUsername);
  if (!newKey) throw new Error("İstifadəçi adı düzgün deyil.");
  if (oldKey && oldKey !== newKey) {
    await deleteUsernameIndex(oldUsername!);
  }
  await writeUsernameIndex(newUsername, uid, authEmail);
}

export function normalizeOrgMember(raw: unknown, uid: string): SystemUserRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const username = typeof o.username === "string" ? o.username.trim() : "";
  const name = typeof o.name === "string" ? o.name.trim() : username;
  const roleRaw = o.role;
  const role: AppUserRole =
    roleRaw === "employee" || roleRaw === "director" || roleRaw === "admin" ? roleRaw : "employee";
  const modulesRaw = Array.isArray(o.modules) ? o.modules : defaultModulesForRole(role);
  const modules = modulesRaw.filter((m): m is PermissionModuleId => typeof m === "string") as PermissionModuleId[];
  if (!username || !name) return null;
  const authEmail = typeof o.authEmail === "string" ? o.authEmail.trim() : undefined;
  return {
    id: uid,
    username,
    name,
    role,
    modules: modules.length > 0 ? modules : defaultModulesForRole(role),
    mustChangePassword: Boolean(o.mustChangePassword),
    disabled: Boolean(o.disabled),
    createdAt: typeof o.createdAt === "number" ? o.createdAt : Date.now(),
    updatedAt: typeof o.updatedAt === "number" ? o.updatedAt : Date.now(),
    ...(authEmail ? { authEmail } : {}),
  };
}

export async function fetchOrgMemberOnce(uid: string): Promise<SystemUserRecord | null> {
  const snap = await getDoc(orgMemberRef(uid));
  if (!snap.exists()) return null;
  return normalizeOrgMember(snap.data(), uid);
}

/** Real-time abunəlik — tək istifadəçi profili (işçilər üçün icazə yenilənməsi). */
export function subscribeOrgMember(uid: string, cb: (member: SystemUserRecord | null) => void): Unsubscribe {
  if (!db) {
    cb(null);
    return () => {};
  }
  return onSnapshot(
    orgMemberRef(uid),
    (snap) => {
      if (!snap.exists()) {
        cb(null);
        return;
      }
      cb(normalizeOrgMember(snap.data(), uid));
    },
    () => cb(null),
  );
}

export async function fetchAllOrgMembersOnce(): Promise<SystemUserRecord[]> {
  const snap = await getDocs(orgMembersCol());
  const out: SystemUserRecord[] = [];
  snap.forEach((d) => {
    const m = normalizeOrgMember(d.data(), d.id);
    if (m && !m.disabled) out.push(m);
  });
  return out.sort((a, b) => a.name.localeCompare(b.name, "az", { sensitivity: "base" }));
}

export function subscribeOrgMembers(cb: (members: SystemUserRecord[]) => void): Unsubscribe {
  return onSnapshot(
    orgMembersCol(),
    (snap) => {
      const out: SystemUserRecord[] = [];
      snap.forEach((d) => {
        const m = normalizeOrgMember(d.data(), d.id);
        if (m) out.push(m);
      });
      out.sort((a, b) => a.name.localeCompare(b.name, "az", { sensitivity: "base" }));
      cb(out);
    },
    () => cb([]),
  );
}

export async function writeOrgMember(member: SystemUserRecord): Promise<void> {
  const now = Date.now();
  const payload = {
    username: member.username,
    name: member.name,
    role: member.role,
    modules: member.modules,
    mustChangePassword: Boolean(member.mustChangePassword),
    disabled: Boolean(member.disabled),
    createdAt: member.createdAt || now,
    updatedAt: now,
    ...(member.authEmail ? { authEmail: member.authEmail } : {}),
  };
  await setDoc(orgMemberRef(member.id), payload, { merge: true });
}

export async function deleteOrgMember(uid: string): Promise<void> {
  await deleteDoc(orgMemberRef(uid));
}

export async function setMemberMustChangePassword(uid: string, mustChangePassword: boolean): Promise<void> {
  await setDoc(orgMemberRef(uid), { mustChangePassword, updatedAt: Date.now() }, { merge: true });
}

export function subscribeOrgWorkspace(
  cb: (snap: { exists: boolean; workspace: DocWorkspace | null; remoteUpdatedAt: number | null }) => void,
): Unsubscribe {
  const ref = orgWorkspaceRef();
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        cb({ exists: false, workspace: null, remoteUpdatedAt: null });
        return;
      }
      const data = snap.data() as {
        workspace?: DocWorkspace;
        updatedAt?: { toMillis?: () => number } | number;
      };
      const ws = (data?.workspace ?? null) as DocWorkspace | null;
      let updatedAt: number | null = null;
      const u = data?.updatedAt;
      if (typeof u === "number") updatedAt = u;
      else if (u && typeof u.toMillis === "function") updatedAt = u.toMillis();
      cb({ exists: true, workspace: ws, remoteUpdatedAt: updatedAt });
    },
    () => cb({ exists: false, workspace: null, remoteUpdatedAt: null }),
  );
}

export async function fetchOrgWorkspaceOnce(): Promise<DocWorkspace | null> {
  const snap = await getDoc(orgWorkspaceRef());
  if (!snap.exists()) return null;
  const data = snap.data() as { workspace?: DocWorkspace };
  return (data?.workspace ?? null) as DocWorkspace | null;
}

export async function writeOrgWorkspace(workspace: DocWorkspace): Promise<void> {
  const workspacePayload = prepareWorkspaceForFirestore(workspace);
  assertFirestorePayloadSize(workspacePayload);
  await setDoc(
    orgWorkspaceRef(),
    {
      workspace: workspacePayload,
      schemaVersion: SCHEMA_VERSION,
      updatedAt: serverTimestamp(),
    },
    { merge: false },
  );
}

/** Developer-in köhnə şəxsi workspace-indən org workspace-ə köçürmə. */
export async function seedOrgWorkspaceFromUser(developerUid: string): Promise<void> {
  const org = await fetchOrgWorkspaceOnce();
  if (org && workspaceHasUserData(normalizeWorkspace(org))) return;
  const personal = await fetchWorkspaceOnce(developerUid);
  if (!personal || !workspaceHasUserData(normalizeWorkspace(personal))) return;
  await writeOrgWorkspace(normalizeWorkspace(personal));
}

export { workspaceFingerprint };
