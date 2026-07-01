const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

initializeApp();

const ORG_ID = "default";

async function canManageUsers(uid) {
  const db = getFirestore();
  const memberSnap = await db.doc(`orgs/${ORG_ID}/members/${uid}`).get();
  if (!memberSnap.exists) return true;
  const role = memberSnap.data()?.role;
  return role === "admin" || role === "director";
}

exports.resetAppUserPassword = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Giriş lazımdır.");
  }
  if (!(await canManageUsers(request.auth.uid))) {
    throw new HttpsError("permission-denied", "Bu əməliyyat üçün icazə yoxdur.");
  }

  const memberUid = request.data?.memberUid;
  const newPassword = request.data?.newPassword;
  if (typeof memberUid !== "string" || !memberUid.trim()) {
    throw new HttpsError("invalid-argument", "İstifadəçi seçilməyib.");
  }
  if (typeof newPassword !== "string" || newPassword.length < 6) {
    throw new HttpsError("invalid-argument", "Şifrə ən azı 6 simvol olmalıdır.");
  }

  const db = getFirestore();
  const memberRef = db.doc(`orgs/${ORG_ID}/members/${memberUid}`);
  const memberSnap = await memberRef.get();
  if (!memberSnap.exists) {
    throw new HttpsError("not-found", "İstifadəçi tapılmadı.");
  }

  await getAuth().updateUser(memberUid, { password: newPassword });
  await memberRef.set(
    {
      mustChangePassword: true,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return { ok: true };
});
