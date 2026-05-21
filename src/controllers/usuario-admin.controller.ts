import { Request, Response } from 'express';
import type { ApiResponse } from '../types';
import {
  crearUsuarioSchema,
  actualizarUsuarioSchema,
  usuarioQuerySchema,
  usuarioIdSchema,
} from '../validation/usuario-admin.schema';
import { usuarioAdminService } from '../services/usuario-admin.service';

function getEmpresaId(req: Request): number {
  const empresaId = Number((req as any).empresaId);
  if (!Number.isFinite(empresaId) || empresaId <= 0) {
    throw new Error('No se pudo obtener empresaId');
  }
  return empresaId;
}

export class UsuarioAdminController {
  async listar(req: Request, res: Response) {
    try {
      const empresaId = getEmpresaId(req);
      const query = usuarioQuerySchema.parse(req.query);
      const result = await usuarioAdminService.listar(empresaId, query);
      res.json({ success: true, data: result, message: 'Usuarios' } as ApiResponse);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ success: false, error: 'Error al listar usuarios', message });
    }
  }

  async detalle(req: Request, res: Response) {
    try {
      const empresaId = getEmpresaId(req);
      const { id } = usuarioIdSchema.parse({ id: req.params.id });
      const result = await usuarioAdminService.detalle(id, empresaId);
      res.json({ success: true, data: result } as ApiResponse);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ success: false, error: 'Error al obtener usuario', message });
    }
  }

  async crear(req: Request, res: Response) {
    try {
      const empresaId = getEmpresaId(req);
      const body = crearUsuarioSchema.parse(req.body);
      const result = await usuarioAdminService.crear(body, empresaId);
      res.status(201).json({ success: true, data: result, message: 'Usuario creado' } as ApiResponse);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ success: false, error: 'Error al crear usuario', message });
    }
  }

  async actualizar(req: Request, res: Response) {
    try {
      const empresaId = getEmpresaId(req);
      const { id } = usuarioIdSchema.parse({ id: req.params.id });
      const body = actualizarUsuarioSchema.parse(req.body);
      const result = await usuarioAdminService.actualizar(id, empresaId, body);
      res.json({ success: true, data: result, message: 'Usuario actualizado' } as ApiResponse);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ success: false, error: 'Error al actualizar usuario', message });
    }
  }

  async desactivar(req: Request, res: Response) {
    try {
      const empresaId = getEmpresaId(req);
      const { id } = usuarioIdSchema.parse({ id: req.params.id });
      const result = await usuarioAdminService.desactivar(id, empresaId);
      res.json({ success: true, data: result, message: 'Usuario desactivado' } as ApiResponse);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ success: false, error: 'Error al desactivar usuario', message });
    }
  }

  async habilitar(req: Request, res: Response) {
    try {
      const empresaId = getEmpresaId(req);
      const { id } = usuarioIdSchema.parse({ id: req.params.id });
      const result = await usuarioAdminService.habilitar(id, empresaId);
      res.json({ success: true, data: result, message: 'Usuario habilitado' } as ApiResponse);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ success: false, error: 'Error al habilitar usuario', message });
    }
  }

  async eliminar(req: Request, res: Response) {
    try {
      const empresaId = getEmpresaId(req);
      const { id } = usuarioIdSchema.parse({ id: req.params.id });
      await usuarioAdminService.eliminar(id, empresaId);
      res.json({ success: true, message: 'Usuario eliminado' } as ApiResponse);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ success: false, error: 'Error al eliminar usuario', message });
    }
  }

  async listarEmpresas(req: Request, res: Response) {
    try {
      const result = await usuarioAdminService.listarEmpresas();
      res.json({ success: true, data: result } as ApiResponse);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ success: false, error: 'Error al listar empresas', message });
    }
  }
}

export const usuarioAdminController = new UsuarioAdminController();