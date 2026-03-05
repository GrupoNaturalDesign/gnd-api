import { Response } from 'express';
import { z } from 'zod';
import { firebaseAuthService } from '../services/firebase-auth.service';
import type { FirebaseAuthRequest } from '../middleware/firebase-auth.middleware';

const sessionSchema = z.object({
  idToken: z.string().min(1),
});

const onboardingSchema = z.object({
  nombre: z.string().min(1).max(255),
  apellido: z.string().max(255),
  fechaNacimiento: z.string().optional(),
});

/**
 * POST /api/auth/register
 * Body: { idToken }. Solo para sincronizar el usuario de Firebase con nuestra DB.
 * No se recibe contraseña: Firebase maneja el registro; nosotros guardamos email + uid (externalId).
 */
export async function register(req: FirebaseAuthRequest, res: Response): Promise<void> {
  const parsed = sessionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: 'idToken requerido',
      details: parsed.error.flatten(),
    });
    return;
  }
  try {
    await firebaseAuthService.getOrCreateSession(parsed.data.idToken);
    res.status(201).json({
      success: true,
      message: 'Usuario registrado en la base de datos.',
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Error al registrar.';
    res.status(401).json({ success: false, error: message });
  }
}

/**
 * POST /api/auth/session
 * Body: { idToken }. Verifica token Firebase, busca/crea usuario, devuelve estado (needsVerification, needsOnboarding, user).
 */
export async function session(req: FirebaseAuthRequest, res: Response): Promise<void> {
  const parsed = sessionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: 'idToken requerido',
      details: parsed.error.flatten(),
    });
    return;
  }
  try {
    const state = await firebaseAuthService.getOrCreateSession(parsed.data.idToken);
    res.status(200).json({
      success: true,
      data: state,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Error al crear sesión.';
    res.status(401).json({ success: false, error: message });
  }
}

/**
 * GET /api/auth/me
 * Requiere Authorization: Bearer <idToken>. Devuelve el estado actual del usuario.
 */
export async function me(req: FirebaseAuthRequest, res: Response): Promise<void> {
  const uid = req.uid;
  if (!uid) {
    res.status(401).json({ success: false, error: 'No autenticado.' });
    return;
  }
  try {
    const state = await firebaseAuthService.getSessionByUid(uid);
    if (!state) {
      res.status(404).json({ success: false, error: 'Usuario no encontrado.' });
      return;
    }
    res.status(200).json({ success: true, data: state });
  } catch {
    res.status(500).json({ success: false, error: 'Error al obtener sesión.' });
  }
}

/**
 * POST /api/auth/onboarding
 * Body: { nombre, apellido, fechaNacimiento }. Requiere Bearer token. Completa onboarding.
 */
export async function onboarding(req: FirebaseAuthRequest, res: Response): Promise<void> {
  const uid = req.uid;
  if (!uid) {
    res.status(401).json({ success: false, error: 'No autenticado.' });
    return;
  }
  const parsed = onboardingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: 'Validación fallida',
      details: parsed.error.flatten(),
    });
    return;
  }
  try {
    const state = await firebaseAuthService.completeOnboarding(uid, {
      nombre: parsed.data.nombre,
      apellido: parsed.data.apellido ?? '',
      fechaNacimiento: parsed.data.fechaNacimiento ?? '',
    });
    res.status(200).json({ success: true, data: state });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Error al completar onboarding.';
    res.status(400).json({ success: false, error: message });
  }
}
