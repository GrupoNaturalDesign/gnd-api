/**
 * Script para crear usuario admin genérico en Firebase y en la DB.
 * Ejecutar desde la raíz del api: npx ts-node src/scripts/create-admin-user.ts
 *
 * Requiere: .env con Firebase Admin (FIREBASE_ADMIN_SDK_JSON o GOOGLE_APPLICATION_CREDENTIALS) y DATABASE_URL.
 */

import 'dotenv/config';
import { getFirebaseAdmin } from '../lib/firebase-admin';
import { prisma } from '../lib/prisma';
import { Rol } from '@prisma/client';

const ADMIN_EMAIL = 'admin@ntds.com';
const ADMIN_PASSWORD = 'ntds2026';
const ADMIN_NOMBRE = 'Admin';
const ADMIN_APELLIDO = 'NTDS';

async function getRoleIdByCode(code: 'ADMIN' | 'USER'): Promise<number> {
  const role = await prisma.role.findUnique({
    where: { code },
    select: { id: true },
  });
  if (!role) throw new Error(`Rol ${code} no existe. Ejecutá primero: npm run prisma:seed`);
  return role.id;
}

async function main() {
  console.log('Creando usuario admin en Firebase...');
  const adminAuth = getFirebaseAdmin().auth();
  let firebaseUser: { uid: string };

  try {
    firebaseUser = await adminAuth.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      displayName: `${ADMIN_NOMBRE} ${ADMIN_APELLIDO}`,
      emailVerified: true,
    });
    console.log('Firebase: usuario creado, uid:', firebaseUser.uid);
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err.code === 'auth/email-already-exists') {
      const existing = await adminAuth.getUserByEmail(ADMIN_EMAIL);
      firebaseUser = { uid: existing.uid };
      console.log('Firebase: el email ya existe, usando uid:', firebaseUser.uid);
    } else {
      throw e;
    }
  }

  const roleId = await getRoleIdByCode('ADMIN');

  const existing = await prisma.usuario.findFirst({
    where: { externalId: firebaseUser.uid },
  });
  if (existing) {
    console.log('DB: usuario ya existe para este uid (id:', existing.id, '). Listo.');
    return;
  }

  const byEmail = await prisma.usuario.findUnique({ where: { email: ADMIN_EMAIL } });
  if (byEmail) {
    console.log('DB: ya existe un usuario con email', ADMIN_EMAIL, '. Actualizando externalId/rol.');
    await prisma.usuario.update({
      where: { email: ADMIN_EMAIL },
      data: {
        externalId: firebaseUser.uid,
        roleId,
        rol: Rol.admin,
        emailVerified: true,
        onboardingCompleted: true,
        nombre: ADMIN_NOMBRE,
        apellido: ADMIN_APELLIDO,
        provider: 'firebase',
      },
    });
    console.log('DB: usuario actualizado.');
    return;
  }

  await prisma.usuario.create({
    data: {
      externalId: firebaseUser.uid,
      email: ADMIN_EMAIL,
      nombre: ADMIN_NOMBRE,
      apellido: ADMIN_APELLIDO,
      rol: Rol.admin,
      roleId,
      provider: 'firebase',
      emailVerified: true,
      onboardingCompleted: true,
      isSystemUser: false,
      activo: true,
    },
  });
  console.log('DB: usuario admin creado.');
  console.log('');
  console.log('Listo. Podés iniciar sesión con:', ADMIN_EMAIL, '/', ADMIN_PASSWORD);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
