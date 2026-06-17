import path from 'path';
import fs from 'fs';
import admin from 'firebase-admin';

let initialized = false;
const LOCAL_SERVICE_ACCOUNT_FILE = 'serviceAccountKey.json';

function assertNoLocalServiceAccountInProduction(): void {
  if (process.env.NODE_ENV !== 'production') return;
  const localPath = path.resolve(process.cwd(), LOCAL_SERVICE_ACCOUNT_FILE);
  if (fs.existsSync(localPath)) {
    throw new Error(
      `Firebase Admin: ${LOCAL_SERVICE_ACCOUNT_FILE} no puede existir en produccion. Rotar la clave y usar FIREBASE_ADMIN_SDK_JSON o credenciales del runtime.`
    );
  }
}

/** Resuelve la ruta del JSON (relativa a process.cwd(), ej. ./serviceAccountKey.json). */
function getCredentialPath(): string {
  const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!envPath) return '';
  if (path.isAbsolute(envPath)) return envPath;
  return path.resolve(process.cwd(), envPath);
}

export function getFirebaseAdmin(): admin.app.App {
  if (!admin.apps.length) {
    assertNoLocalServiceAccountInProduction();
    let credential: admin.credential.Credential | undefined;
    if (process.env.FIREBASE_ADMIN_SDK_JSON) {
      credential = admin.credential.cert(JSON.parse(process.env.FIREBASE_ADMIN_SDK_JSON) as admin.ServiceAccount);
    } else {
      const credPath = getCredentialPath();
      if (credPath) {
        if (process.env.NODE_ENV === 'production') {
          throw new Error(
            'Firebase Admin: GOOGLE_APPLICATION_CREDENTIALS por archivo esta bloqueado en produccion. Usar FIREBASE_ADMIN_SDK_JSON o credenciales del runtime.'
          );
        }
        credential = admin.credential.cert(require(credPath) as admin.ServiceAccount);
      }
    }
    admin.initializeApp(credential ? { credential } : { credential: admin.credential.applicationDefault() });
    initialized = true;
  }
  return admin.app();
}

export async function verifyIdToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
  const app = getFirebaseAdmin();
  return app.auth().verifyIdToken(idToken);
}
