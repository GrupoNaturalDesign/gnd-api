import { prisma } from '../lib/prisma';
import { verifyIdToken } from '../lib/firebase-admin';
import { Rol } from '@prisma/client';
import { rolToAuthRole } from '../types/auth.types';

async function getRoleIdByCode(code: 'ADMIN' | 'USER'): Promise<number> {
  const role = await prisma.role.findUnique({
    where: { code },
    select: { id: true },
  });
  if (!role) throw new Error(`Rol ${code} no existe. Ejecute el seed de roles.`);
  return role.id;
}

export interface SessionUserState {
  uid: string;
  email: string;
  emailVerified: boolean;
  needsEmailVerification: boolean;
  needsOnboarding: boolean;
  onboardingCompleted: boolean;
  nombre: string | null;
  apellido: string | null;
  role: string;
  empresaId: number | null;
  usuarioId: number;
}

export const firebaseAuthService = {
  /**
   * Verifica el token de Firebase y busca/crea usuario en DB.
   * Devuelve el estado para que el cliente sepa a qué paso redirigir.
   */
  async getOrCreateSession(idToken: string): Promise<SessionUserState> {
    const decoded = await verifyIdToken(idToken);
    const uid = decoded.uid;
    const email = (decoded.email || '').trim().toLowerCase();
    const firebaseEmailVerified = !!decoded.email_verified;
    const provider = decoded.firebase?.sign_in_provider || 'password';

    if (!email) {
      throw new Error('Usuario sin email no soportado.');
    }

    let user = await prisma.usuario.findFirst({
      where: { externalId: uid },
      include: { role: true },
    });

    if (!user) {
      const roleUserId = await getRoleIdByCode('USER');
      const displayName = (decoded.name || '').trim();
      const nameParts = displayName ? displayName.split(/\s+/).filter(Boolean) : [];
      // Solo usar nombre/apellido cuando Firebase/Google envían un nombre real (ej. Google); si no, dejar vacío para onboarding
      const hasRealName = nameParts.length > 0 && !displayName.includes('@');
      const nombre = hasRealName ? nameParts[0]! : '';
      const apellido = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;

      user = await prisma.usuario.create({
        data: {
          externalId: uid,
          email,
          nombre: nombre || 'Usuario',
          apellido,
          rol: 'cliente' as Rol,
          roleId: roleUserId,
          provider: provider === 'google.com' ? 'google' : 'firebase',
          emailVerified: firebaseEmailVerified,
          avatarUrl: decoded.picture || null,
          onboardingCompleted: false,
        },
        include: { role: true },
      });
    } else {
      const updatedEmailVerified = firebaseEmailVerified || user.emailVerified;
      if (user.emailVerified !== updatedEmailVerified) {
        await prisma.usuario.update({
          where: { id: user.id },
          data: { emailVerified: updatedEmailVerified, updatedAt: new Date() },
        });
        user.emailVerified = updatedEmailVerified;
      }
    }

    const role = user.role?.code ?? rolToAuthRole(user.rol);
    const needsEmailVerification =
      provider !== 'google.com' && !user.emailVerified && !firebaseEmailVerified;
    const needsOnboarding = !user.onboardingCompleted;

    return {
      uid,
      email: user.email,
      emailVerified: user.emailVerified,
      needsEmailVerification,
      needsOnboarding,
      onboardingCompleted: user.onboardingCompleted,
      nombre: user.nombre,
      apellido: user.apellido,
      role,
      empresaId: user.empresaId,
      usuarioId: user.id,
    };
  },

  async getSessionByUid(uid: string): Promise<SessionUserState | null> {
    const user = await prisma.usuario.findFirst({
      where: { externalId: uid },
      include: { role: true },
    });
    if (!user || !user.activo) return null;

    const role = user.role?.code ?? rolToAuthRole(user.rol);
    const needsEmailVerification = !user.emailVerified;
    const needsOnboarding = !user.onboardingCompleted;

    return {
      uid: user.externalId!,
      email: user.email,
      emailVerified: user.emailVerified,
      needsEmailVerification,
      needsOnboarding,
      onboardingCompleted: user.onboardingCompleted,
      nombre: user.nombre,
      apellido: user.apellido,
      role,
      empresaId: user.empresaId,
      usuarioId: user.id,
    };
  },

  async completeOnboarding(
    uid: string,
    data: { nombre: string; apellido: string; fechaNacimiento: string }
  ): Promise<SessionUserState> {
    const user = await prisma.usuario.findFirst({
      where: { externalId: uid },
      include: { role: true },
    });
    if (!user) throw new Error('Usuario no encontrado.');
    if (user.onboardingCompleted) {
      return this.getSessionByUid(uid) as Promise<SessionUserState>;
    }

    const fecha = data.fechaNacimiento ? new Date(data.fechaNacimiento) : null;
    await prisma.usuario.update({
      where: { id: user.id },
      data: {
        nombre: data.nombre.trim(),
        apellido: data.apellido?.trim() || null,
        fechaNacimiento: fecha,
        onboardingCompleted: true,
        updatedAt: new Date(),
      },
    });

    const updated = await this.getSessionByUid(uid);
    if (!updated) throw new Error('Error al actualizar sesión.');
    return updated;
  },
};
