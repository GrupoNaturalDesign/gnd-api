import { Response, NextFunction } from 'express';
import { FirebaseAuthRequest } from '../middleware/firebase-auth.middleware';
import prisma from '../lib/prisma';
import { solicitudPortalSchema, decisionPortalSchema } from '../validation/portal-identidad.schema';
import { ZodError } from 'zod';

function manejarError(error: unknown, res: Response, next: NextFunction) {
  if (error instanceof ZodError) {
    res.status(400).json({ success: false, error: error.issues.map((issue) => issue.message).join(' ') }); return;
  }
  if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
    res.status(409).json({ success: false, error: 'Esta identidad ya está vinculada a otra cuenta. Revisá la asociación antes de aprobar.' }); return;
  }
  next(error);
}

async function usuarioActual(req: FirebaseAuthRequest) {
  const usuario = await prisma.usuario.findFirst({ where: { externalId: req.uid, activo: true } });
  if (!usuario) throw Object.assign(new Error('Cuenta no disponible.'), { status: 403 });
  return usuario;
}

export async function estado(req: FirebaseAuthRequest, res: Response, next: NextFunction) {
  res.set('Cache-Control', 'no-store');
  try {
    const usuario = await usuarioActual(req);
    const identidad = await prisma.portalIdentidad.findUnique({ where: { usuarioId: usuario.id } });
    res.json({ success: true, data: { estado: identidad?.estado ?? 'sin_solicitud', emailVerificado: usuario.emailVerified } });
  } catch (error) { manejarError(error, res, next); }
}

export async function solicitar(req: FirebaseAuthRequest, res: Response, next: NextFunction) {
  try {
    const body = req.body;
    req.body = {}; // Auditar la acción sin copiar documentos al log global.
    const { documento: dni } = solicitudPortalSchema.parse(body);
    const usuario = await usuarioActual(req);
    if (!usuario.emailVerified) {
      res.status(409).json({ success: false, error: 'Verificá tu email antes de solicitar la vinculación.' }); return;
    }
    const result = await prisma.$transaction(async (tx) => {
      await tx.portalIdentidad.upsert({ where: { usuarioId: usuario.id }, create: { usuarioId: usuario.id, dni }, update: {} });
      // Nunca sustituir una identidad aprobada desde el formulario público.
      await tx.portalIdentidad.updateMany({ where: { usuarioId: usuario.id, estado: { not: 'aprobado' } },
        data: { dni, estado: 'pendiente', motivo: null, aprobadoPor: null, dniVerificado: null } });
      return tx.portalIdentidad.findUniqueOrThrow({ where: { usuarioId: usuario.id } });
    });
    res.json({ success: true, data: { estado: result.estado } });
  } catch (error) { manejarError(error, res, next); }
}

export async function listar(req: FirebaseAuthRequest, res: Response, next: NextFunction) {
  res.set('Cache-Control', 'no-store');
  try {
    await usuarioActual(req);
    const usuarios = await prisma.usuario.findMany({
      where: { activo: true, OR: [{ empresaId: Number(req.empresaId) }, { empresaId: null }] }, select: { id: true, email: true } });
    const rows = await prisma.portalIdentidad.findMany({ where: { usuarioId: { in: usuarios.map((u) => u.id) } },
      orderBy: { updatedAt: 'desc' }, take: 100 });
    const emails = new Map(usuarios.map((u) => [u.id, u.email]));
    res.json({ success: true, data: rows.map((r) => ({ usuarioId: r.usuarioId, email: emails.get(r.usuarioId), dni: r.dni, estado: r.estado })) });
  } catch (error) { manejarError(error, res, next); }
}

export async function decidir(req: FirebaseAuthRequest, res: Response, next: NextFunction) {
  try {
    const body = req.body;
    req.body = {};
    const input = decisionPortalSchema.parse(body);
    const administrador = await usuarioActual(req);
    const usuario = await prisma.usuario.findFirst({ where: {
      email: input.email, activo: true, OR: [{ empresaId: Number(req.empresaId) }, { empresaId: null }] } });
    if (!usuario) { res.status(404).json({ success: false, error: 'Cuenta no encontrada en esta tienda.' }); return; }
    if (!usuario.emailVerified) { res.status(409).json({ success: false, error: 'La cuenta debe verificar su email.' }); return; }
    const data = { dni: input.documento, estado: input.aprobar ? 'aprobado' : 'rechazado',
      dniVerificado: input.aprobar ? input.documento : null, aprobadoPor: administrador.id, motivo: input.motivo };
    await prisma.portalIdentidad.upsert({ where: { usuarioId: usuario.id }, create: { usuarioId: usuario.id, ...data }, update: data });
    res.json({ success: true, data: { estado: data.estado } });
  } catch (error) { manejarError(error, res, next); }
}
