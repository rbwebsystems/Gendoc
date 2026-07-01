import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

/**
 * Firebase config is read from Vite environment variables.
 * Storage istifadə olunmur — qovluq faylları Firestore-da saxlanır (Spark / ödənişsiz rejim).
 *
 * Required:
 *   VITE_FIREBASE_API_KEY
 *   VITE_FIREBASE_AUTH_DOMAIN
 *   VITE_FIREBASE_PROJECT_ID
 *   VITE_FIREBASE_MESSAGING_SENDER_ID
 *   VITE_FIREBASE_APP_ID
 */
const env = import.meta.env;

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined,
};

const requiredKeys: Array<keyof typeof firebaseConfig> = [
  "apiKey",
  "authDomain",
  "projectId",
  "messagingSenderId",
  "appId",
];

const missing = requiredKeys.filter((k) => !firebaseConfig[k]);

export const firebaseEnabled: boolean = missing.length === 0;
export const firebaseConfigError: string | null =
  firebaseEnabled ? null : `Firebase config missing: ${missing.join(", ")}`;

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;

if (firebaseEnabled) {
  _app = initializeApp({
    apiKey: firebaseConfig.apiKey!,
    authDomain: firebaseConfig.authDomain!,
    projectId: firebaseConfig.projectId!,
    messagingSenderId: firebaseConfig.messagingSenderId!,
    appId: firebaseConfig.appId!,
  });
  _auth = getAuth(_app);
  _db = getFirestore(_app);
}

export const firebaseProjectId: string = firebaseConfig.projectId ?? "gendoc";

export const firebaseApp = _app;
export const auth = _auth;
export const db = _db;
