import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  signOut,
  type Auth,
} from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseApp, firebaseEnabled } from "./firebase";

const APP_USER_EMAIL_SUFFIX = ".app.gendoc";

export function appUserEmailSuffix(projectId: string): string {
  return `@${projectId}${APP_USER_EMAIL_SUFFIX}`;
}

/** İstifadəçi adından Firebase Auth email-i (saxta domen). */
export function usernameToAuthEmail(username: string, projectId: string): string {
  const normalized = username
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9._-]/g, "");
  if (!normalized) return "";
  return `${normalized}@${projectId}${APP_USER_EMAIL_SUFFIX}`;
}

export function isAppUserAuthEmail(email: string, projectId: string): boolean {
  return email.trim().toLowerCase().endsWith(appUserEmailSuffix(projectId).toLowerCase());
}

/** Developer hesabı — real email ilə daxil olur (app user domeni deyil). */
export function isDeveloperAuthEmail(email: string, projectId: string): boolean {
  return Boolean(email.trim()) && !isAppUserAuthEmail(email, projectId);
}

export function resolveLoginEmail(identifier: string, projectId: string): string {
  const raw = identifier.trim();
  if (!raw) return "";
  if (raw.includes("@")) return raw.toLowerCase();
  return usernameToAuthEmail(raw, projectId);
}

export function validateUsername(username: string): string | null {
  const normalized = username
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9._-]/g, "");
  if (normalized.length < 2) return "İstifadəçi adı ən azı 2 simvol olmalıdır.";
  if (normalized !== username.trim().toLowerCase().replace(/\s+/g, "")) {
    return "Yalnız hərf, rəqəm, nöqtə, tire və alt xətt icazəlidir.";
  }
  return null;
}

let secondaryApp: FirebaseApp | null = null;
let secondaryAuth: Auth | null = null;

function getSecondaryAuth(): Auth {
  if (!firebaseEnabled || !firebaseApp) {
    throw new Error("Firebase konfiqurasiya edilməyib.");
  }
  if (!secondaryAuth) {
    const existing = getApps().find((a) => a.name === "gendoc-admin");
    secondaryApp = existing ?? initializeApp(firebaseApp.options, "gendoc-admin");
    secondaryAuth = getAuth(secondaryApp);
  }
  return secondaryAuth;
}

/** Admin sessiyasını dəyişmədən yeni app istifadəçisi yaradır. */
export async function createAppUserAuthAccount(
  authEmail: string,
  password: string,
): Promise<{ uid: string; authEmail: string }> {
  const a = getSecondaryAuth();
  const cred = await createUserWithEmailAndPassword(a, authEmail, password);
  await signOut(a);
  return { uid: cred.user.uid, authEmail };
}

/** Admin tərəfindən istifadəçi şifrəsinin sıfırlanması (Cloud Function). */
export async function resetAppUserPassword(memberUid: string, newPassword: string): Promise<void> {
  if (!firebaseEnabled || !firebaseApp) {
    throw new Error("Firebase konfiqurasiya edilməyib.");
  }
  const functions = getFunctions(firebaseApp);
  const resetFn = httpsCallable<{ memberUid: string; newPassword: string }, { ok: boolean }>(
    functions,
    "resetAppUserPassword",
  );
  await resetFn({ memberUid, newPassword });
}
