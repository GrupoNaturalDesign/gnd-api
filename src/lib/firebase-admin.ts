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

/** Parse Firebase service account from env (Hostinger/Vercel-safe). */
function parseFirebaseServiceAccountFromEnv(): admin.ServiceAccount {
  const b64 = process.env.FIREBASE_ADMIN_SDK_JSON_B64?.trim();
  if (b64) {
    return JSON.parse(Buffer.from(b64, 'base64').toString('utf8')) as admin.ServiceAccount;
  }

  const raw = process.env.FIREBASE_ADMIN_SDK_JSON?.trim();
  if (!raw) {
    throw new Error(
      'Firebase Admin: configurar FIREBASE_ADMIN_SDK_JSON_B64 o FIREBASE_ADMIN_SDK_JSON.'
    );
  }

  const candidates = new Set<string>([raw]);
  if (
    (raw.startsWith("'") && raw.endsWith("'")) ||
    (raw.startsWith('"') && raw.endsWith('"'))
  ) {
    candidates.add(raw.slice(1, -1));
  }
  if (raw.includes('\\"')) {
    candidates.add(raw.replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as admin.ServiceAccount;
    } catch {
      // try next normalization
    }
  }

  throw new Error('Firebase Admin: FIREBASE_ADMIN_SDK_JSON no es JSON valido.');
}

export function getFirebaseAdmin(): admin.app.App {
  if (!admin.apps.length) {
    assertNoLocalServiceAccountInProduction();
    let credential: admin.credential.Credential | undefined;
    if (process.env.FIREBASE_ADMIN_SDK_JSON_B64 || process.env.FIREBASE_ADMIN_SDK_JSON) {
      credential = admin.credential.cert(parseFirebaseServiceAccountFromEnv());
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
