import path from 'path';
import admin from 'firebase-admin';

let initialized = false;

/** Resuelve la ruta del JSON (relativa a process.cwd(), ej. ./serviceAccountKey.json). */
function getCredentialPath(): string {
  const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!envPath) return '';
  if (path.isAbsolute(envPath)) return envPath;
  return path.resolve(process.cwd(), envPath);
}

export function getFirebaseAdmin(): admin.app.App {
  if (!admin.apps.length) {
    let credential: admin.credential.Credential | undefined;
    if (process.env.FIREBASE_ADMIN_SDK_JSON) {
      credential = admin.credential.cert(JSON.parse(process.env.FIREBASE_ADMIN_SDK_JSON) as admin.ServiceAccount);
    } else {
      const credPath = getCredentialPath();
      if (credPath) {
        credential = admin.credential.cert(require(credPath) as admin.ServiceAccount);
      }
    }
    if (!credential) {
      throw new Error('Firebase Admin: set FIREBASE_ADMIN_SDK_JSON o GOOGLE_APPLICATION_CREDENTIALS (ej. ./serviceAccountKey.json)');
    }
    admin.initializeApp({ credential });
    initialized = true;
  }
  return admin.app();
}

export async function verifyIdToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
  const app = getFirebaseAdmin();
  return app.auth().verifyIdToken(idToken);
}
