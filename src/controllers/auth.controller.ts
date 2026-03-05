import { Request, Response } from 'express';
import { authService } from '../services/auth.service';
import { z } from 'zod';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  nombre: z.string().min(1).max(255),
  apellido: z.string().max(255).optional(),
  telefono: z.string().max(50).optional(),
  empresaId: z.number().int().positive().optional(),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8),
});

const verifyEmailSchema = z.object({
  token: z.string().min(1),
});

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const googleProfileSchema = z.object({
  sub: z.string(),
  email: z.string().email().optional().nullable(),
  name: z.string().optional().nullable(),
  picture: z.string().url().optional().nullable(),
});

/**
 * POST /api/auth/register
 * Crea usuario con email/password, genera token de verificación.
 * El cliente debe enviar el email de verificación (link con ?token=...).
 */
export async function register(req: Request, res: Response): Promise<void> {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: 'Validación fallida',
      details: parsed.error.flatten(),
    });
    return;
  }
  try {
    const { userId, token, expiresAt } = await authService.register(parsed.data);
    const baseUrl = process.env.CLIENT_URL || process.env.FRONTEND_URL || 'http://localhost:3002';
    const verifyUrl = `${baseUrl}/auth/verify-email?token=${token}`;
    // TODO: enviar email con verifyUrl (nodemailer, Resend, etc.)
    if (process.env.NODE_ENV === 'development') {
      console.log('[auth] Verify email URL:', verifyUrl);
    }
    res.status(201).json({
      success: true,
      message: 'Usuario registrado. Revisá tu email para verificar la cuenta.',
      data: { userId, verifyUrl: process.env.NODE_ENV === 'development' ? verifyUrl : undefined },
    });
  } catch (e: any) {
    if (e.message?.includes('Ya existe')) {
      res.status(409).json({ success: false, error: e.message });
      return;
    }
    if (e.message?.includes('empresa')) {
      res.status(400).json({ success: false, error: e.message });
      return;
    }
    res.status(500).json({ success: false, error: 'Error al registrar.' });
  }
}

/**
 * POST /api/auth/forgot-password
 * Genera token de reset y devuelve (en dev) el link. En producción se envía por email.
 */
export async function forgotPassword(req: Request, res: Response): Promise<void> {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: 'Email inválido',
      details: parsed.error.flatten(),
    });
    return;
  }
  const result = await authService.forgotPassword(parsed.data.email);
  if (!result) {
    res.status(200).json({
      success: true,
      message: 'Si el email existe, recibirás un enlace para restablecer la contraseña.',
    });
    return;
  }
  const baseUrl = process.env.CLIENT_URL || process.env.FRONTEND_URL || 'http://localhost:3002';
  const resetUrl = `${baseUrl}/auth/reset-password?token=${result.token}`;
  // TODO: enviar email con resetUrl
  if (process.env.NODE_ENV === 'development') {
    console.log('[auth] Reset password URL:', resetUrl);
  }
  res.status(200).json({
    success: true,
    message: 'Si el email existe, recibirás un enlace para restablecer la contraseña.',
    ...(process.env.NODE_ENV === 'development' && { resetUrl }),
  });
}

/**
 * POST /api/auth/reset-password
 * Restablece la contraseña con el token recibido por email.
 */
export async function resetPassword(req: Request, res: Response): Promise<void> {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: 'Datos inválidos',
      details: parsed.error.flatten(),
    });
    return;
  }
  const ok = await authService.resetPassword(parsed.data.token, parsed.data.newPassword);
  if (!ok) {
    res.status(400).json({
      success: false,
      error: 'Token inválido o expirado.',
    });
    return;
  }
  res.status(200).json({
    success: true,
    message: 'Contraseña actualizada. Iniciá sesión con la nueva contraseña.',
  });
}

/**
 * GET /api/auth/verify-email?token=...  o  POST /api/auth/verify-email { token }
 * Marca el email como verificado.
 */
export async function verifyEmail(req: Request, res: Response): Promise<void> {
  const token = (req.query.token as string) || (req.body?.token as string);
  const parsed = verifyEmailSchema.safeParse({ token });
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: 'Token requerido.',
    });
    return;
  }
  const ok = await authService.verifyEmail(parsed.data.token);
  if (!ok) {
    res.status(400).json({
      success: false,
      error: 'Token inválido o expirado.',
    });
    return;
  }
  res.status(200).json({
    success: true,
    message: 'Email verificado. Ya podés iniciar sesión.',
  });
}

/**
 * POST /api/auth/credentials
 * Valida email/password y devuelve el payload para que Auth.js (Next) cree la sesión.
 * Usado por el Credentials provider de Auth.js.
 */
export async function credentials(req: Request, res: Response): Promise<void> {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: 'Email y contraseña requeridos',
      details: parsed.error.flatten(),
    });
    return;
  }
  const user = await authService.validateCredentials(parsed.data.email, parsed.data.password);
  if (!user) {
    res.status(401).json({
      success: false,
      error: 'Credenciales inválidas.',
    });
    return;
  }
  res.status(200).json({
    success: true,
    data: user,
  });
}

/**
 * POST /api/auth/google
 * Find or create user from Google profile. Used by Auth.js after Google OAuth.
 * Returns 403 if the email belongs to an isSystemUser (cannot use Google).
 */
export async function googleProfile(req: Request, res: Response): Promise<void> {
  const parsed = googleProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: 'Perfil inválido',
      details: parsed.error.flatten(),
    });
    return;
  }
  const user = await authService.findOrCreateUserFromGoogle(parsed.data);
  if (!user) {
    res.status(403).json({
      success: false,
      error: 'Esta cuenta no puede usar inicio con Google.',
    });
    return;
  }
  res.status(200).json({
    success: true,
    data: user,
  });
}
