import { z } from 'zod';

const rolValues = ['admin', 'vendedor', 'cliente'] as const;

export const crearUsuarioSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  nombre: z.string().min(1, 'El nombre es requerido').max(255),
  apellido: z.string().max(255).optional(),
  telefono: z.string().max(50).optional(),
  rol: z.enum(rolValues).default('cliente'),
  empresaId: z.number().int().positive().optional(),
});

export type CrearUsuarioInput = z.infer<typeof crearUsuarioSchema>;

export const actualizarUsuarioSchema = z.object({
  nombre: z.string().min(1).max(255).optional(),
  apellido: z.string().max(255).optional(),
  telefono: z.string().max(50).optional(),
  rol: z.enum(rolValues).optional(),
  empresaId: z.number().int().positive().nullable().optional(),
  activo: z.boolean().optional(),
});

export type ActualizarUsuarioInput = z.infer<typeof actualizarUsuarioSchema>;

export const usuarioQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  q: z.string().optional(),
  rol: z.enum(rolValues).optional(),
  activo: z.coerce.boolean().optional(),
});

export type UsuarioQueryParams = z.infer<typeof usuarioQuerySchema>;

export const usuarioIdSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type UsuarioIdParams = z.infer<typeof usuarioIdSchema>;