import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { AuthTokenType, Rol } from '@prisma/client';
import type { RegisterBody, AuthUserPayload } from '../types/auth.types';
import { rolToAuthRole } from '../types/auth.types';

const SALT_ROUNDS = 12;
const TOKEN_BYTES = 32;
const EMAIL_VERIFICATION_EXPIRES_HOURS = 24;
const PASSWORD_RESET_EXPIRES_HOURS = 1;

/** Obtener roleId por código (ADMIN | USER). */
async function getRoleIdByCode(code: 'ADMIN' | 'USER'): Promise<number> {
  const role = await prisma.role.findUnique({
    where: { code },
    select: { id: true },
  });
  if (!role) throw new Error(`Rol ${code} no existe. Ejecute el seed de roles.`);
  return role.id;
}

export const authService = {
  async hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, SALT_ROUNDS);
  },

  async verifyPassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  },

  generateSecureToken(): string {
    return crypto.randomBytes(TOKEN_BYTES).toString('hex');
  },

  async createAuthToken(
    usuarioId: number,
    type: AuthTokenType,
    expiresInHours: number
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = this.generateSecureToken();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiresInHours);
    await prisma.authToken.create({
      data: {
        usuarioId,
        token,
        type,
        expiresAt,
      },
    });
    return { token, expiresAt };
  },

  async getValidAuthToken(
    token: string,
    type: AuthTokenType
  ): Promise<{ id: number; usuarioId: number } | null> {
    const record = await prisma.authToken.findFirst({
      where: { token, type, expiresAt: { gt: new Date() } },
      select: { id: true, usuarioId: true },
    });
    return record;
  },

  async invalidateAuthToken(token: string): Promise<void> {
    await prisma.authToken.deleteMany({ where: { token } });
  },

  async invalidateTokensByUserAndType(usuarioId: number, type: AuthTokenType): Promise<void> {
    await prisma.authToken.deleteMany({ where: { usuarioId, type } });
  },

  async findUserByEmail(email: string) {
    return prisma.usuario.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: { role: true },
    });
  },

  /**
   * Valida email/password y devuelve el payload para Auth.js (JWT/sesión).
   * Retorna null si credenciales inválidas o usuario inactivo.
   * No permite login por credentials a usuarios sin passwordHash (solo OAuth).
   */
  async validateCredentials(email: string, password: string): Promise<AuthUserPayload | null> {
    const user = await this.findUserByEmail(email);
    if (!user || !user.activo) return null;
    if (!user.passwordHash) return null;
    const ok = await this.verifyPassword(password, user.passwordHash);
    if (!ok) return null;
    const role = user.role?.code ?? rolToAuthRole(user.rol);
    return {
      id: user.id,
      email: user.email,
      nombre: user.nombre,
      apellido: user.apellido,
      role,
      empresaId: user.empresaId,
      isSystemUser: user.isSystemUser,
      emailVerified: user.emailVerified,
    };
  },

  /**
   * Registro con email/password.
   * Crea usuario con role USER, emailVerified false, y token de verificación.
   * empresaId es lógica de negocio: si el cliente lo envía se guarda; si no, queda null.
   */
  async register(body: RegisterBody): Promise<{ userId: number; token: string; expiresAt: Date }> {
    const email = body.email.trim().toLowerCase();
    const existing = await prisma.usuario.findUnique({ where: { email } });
    if (existing) {
      throw new Error('Ya existe un usuario con ese email.');
    }
    const roleUserId = await getRoleIdByCode('USER');
    const passwordHash = await this.hashPassword(body.password);
    const user = await prisma.usuario.create({
      data: {
        email,
        nombre: body.nombre.trim(),
        apellido: body.apellido?.trim() || null,
        telefono: body.telefono?.trim() || null,
        empresaId: body.empresaId ?? undefined,
        rol: 'cliente',
        roleId: roleUserId,
        provider: 'credentials',
        passwordHash,
        isSystemUser: false,
        emailVerified: false,
      },
    });
    const { token, expiresAt } = await this.createAuthToken(
      user.id,
      'EMAIL_VERIFICATION',
      EMAIL_VERIFICATION_EXPIRES_HOURS
    );
    return { userId: user.id, token, expiresAt };
  },

  /**
   * Inicia flujo de recuperación de contraseña: crea token y devuelve datos para enviar email.
   * Solo para usuarios con passwordHash (no isSystemUser que no usan "olvidé contraseña" en UI).
   */
  async forgotPassword(email: string): Promise<{ token: string; expiresAt: Date } | null> {
    const user = await this.findUserByEmail(email);
    if (!user || !user.passwordHash || user.isSystemUser) return null;
    await this.invalidateTokensByUserAndType(user.id, 'PASSWORD_RESET');
    const { token, expiresAt } = await this.createAuthToken(
      user.id,
      'PASSWORD_RESET',
      PASSWORD_RESET_EXPIRES_HOURS
    );
    return { token, expiresAt };
  },

  /**
   * Restablece contraseña con token válido. Invalida el token después.
   */
  async resetPassword(token: string, newPassword: string): Promise<boolean> {
    const record = await this.getValidAuthToken(token, 'PASSWORD_RESET');
    if (!record) return false;
    const passwordHash = await this.hashPassword(newPassword);
    await prisma.usuario.update({
      where: { id: record.usuarioId },
      data: { passwordHash, updatedAt: new Date() },
    });
    await this.invalidateAuthToken(token);
    return true;
  },

  /**
   * Marca email como verificado usando el token. Invalida el token después.
   */
  async verifyEmail(token: string): Promise<boolean> {
    const record = await this.getValidAuthToken(token, 'EMAIL_VERIFICATION');
    if (!record) return false;
    await prisma.usuario.update({
      where: { id: record.usuarioId },
      data: { emailVerified: true, updatedAt: new Date() },
    });
    await this.invalidateAuthToken(token);
    return true;
  },

  /**
   * Find or create user from Google profile (para Auth.js).
   * Si el usuario existe con isSystemUser true, retorna null (no puede usar Google).
   */
  async findOrCreateUserFromGoogle(profile: {
    sub: string;
    email?: string | null;
    name?: string | null;
    picture?: string | null;
  }): Promise<AuthUserPayload | null> {
    const email = (profile.email || '').trim().toLowerCase();
    if (!email) return null;
    const existing = await this.findUserByEmail(email);
    if (existing) {
      if (existing.isSystemUser) return null; // No puede usar Google
      const role = existing.role?.code ?? rolToAuthRole(existing.rol);
      return {
        id: existing.id,
        email: existing.email,
        nombre: existing.nombre,
        apellido: existing.apellido,
        role,
        empresaId: existing.empresaId,
        isSystemUser: existing.isSystemUser,
        emailVerified: existing.emailVerified,
      };
    }
    const roleUserId = await getRoleIdByCode('USER');
    const nameParts = (profile.name || email).split(/\s+/);
    const nombre = nameParts[0] || email;
    const apellido = nameParts.slice(1).join(' ') || null;
    const user = await prisma.usuario.create({
      data: {
        email,
        externalId: profile.sub,
        nombre,
        apellido,
        rol: 'cliente',
        roleId: roleUserId,
        provider: 'google',
        emailVerified: true,
        avatarUrl: profile.picture || null,
      },
    });
    return {
      id: user.id,
      email: user.email,
      nombre: user.nombre,
      apellido: user.apellido,
      role: 'USER',
      empresaId: user.empresaId,
      isSystemUser: false,
      emailVerified: true,
    };
  },
};
