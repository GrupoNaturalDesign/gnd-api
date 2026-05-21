import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import type { ApiResponse } from '../types';
import { paramAsString } from '../utils/http-param.util';

function toOptionalDecimal(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : undefined;
}

function toOptionalInt(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const n = typeof value === 'number' ? value : parseInt(String(value), 10);
  return Number.isFinite(n) ? n : undefined;
}

export class CuponAdminController {
  async listar(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).empresaId;
      if (!empresaId) {
        return res.status(400).json({ success: false, error: 'Empresa no especificada' });
      }

      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const estado = req.query.estado as string | undefined;
      const search =
        typeof req.query.search === 'string' ? req.query.search.trim() : '';

      const where: any = { empresaId };
      if (estado) {
        where.estado = estado;
      }
      if (search) {
        where.OR = [{ codigo: { contains: search } }, { nombre: { contains: search } }];
      }

      const [cupones, total] = await Promise.all([
        prisma.cupon.findMany({
          where,
          include: {
            productosWeb: true,
            productosPadre: true,
            rubros: true,
            subrubros: true,
            _count: { select: { usages: true } },
          },
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { creadoEn: 'desc' },
        }),
        prisma.cupon.count({ where }),
      ]);

      res.json({
        success: true,
        data: cupones,
        message: 'Cupones obtenidos exitosamente',
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (error: any) {
      console.error('[CuponAdminController.listar] Error:', error);
      res.status(500).json({ success: false, error: 'Error al listar cupones', message: error.message });
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).empresaId;
      const id = paramAsString(req.params.id);

      if (!empresaId) {
        return res.status(400).json({ success: false, error: 'Empresa no especificada' });
      }

      if (!id) {
        return res.status(400).json({ success: false, error: 'ID no especificado' });
      }

      const cuponId = parseInt(id, 10);

      const cupon = await prisma.cupon.findFirst({
        where: { id: cuponId, empresaId },
        include: {
          productosWeb: true,
          productosPadre: true,
          rubros: true,
          subrubros: true,
          usages: { take: 10, orderBy: { usadoEn: 'desc' } },
          _count: { select: { usages: true, pedidos: true } },
        },
      });

      if (!cupon) {
        return res.status(404).json({ success: false, error: 'Cupón no encontrado' });
      }

      res.json({ success: true, data: cupon, message: 'Cupón obtenido exitosamente' });
    } catch (error: any) {
      console.error('[CuponAdminController.getById] Error:', error);
      res.status(500).json({ success: false, error: 'Error al obtener cupón', message: error.message });
    }
  }

  async crear(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).empresaId;
      if (!empresaId) {
        return res.status(400).json({ success: false, error: 'Empresa no especificada' });
      }

      const body = req.body;
      const codigo = body.codigo ? String(body.codigo).toUpperCase() : '';
      const nombre = body.nombre ? String(body.nombre) : '';
      const tipoDescuento = body.tipoDescuento;
      const valorDescuento = toOptionalDecimal(body.valorDescuento);
      const alcance = body.alcance;
      const fechaInicio = body.fechaInicio;

      if (!codigo || !nombre || !tipoDescuento || valorDescuento == null || !alcance || !fechaInicio) {
        return res.status(400).json({ success: false, error: 'Faltan campos requeridos' });
      }

      const existingCupon = await prisma.cupon.findFirst({
        where: { empresaId, codigo },
      });

      if (existingCupon) {
        return res.status(400).json({ success: false, error: 'Ya existe un cupón con este código' });
      }

      const cupon = await prisma.cupon.create({
        data: {
          empresaId,
          codigo,
          nombre,
          descripcion: body.descripcion ?? null,
          tipoDescuento,
          valorDescuento,
          alcance,
          montoMinimo: toOptionalDecimal(body.montoMinimo) ?? null,
          montoMaximoDescuento: toOptionalDecimal(body.montoMaximoDescuento) ?? null,
          usoMaximo: toOptionalInt(body.usoMaximo) ?? null,
          usoMaximoUsuario: toOptionalInt(body.usoMaximoUsuario) ?? null,
          fechaInicio: new Date(fechaInicio),
          fechaFin: body.fechaFin ? new Date(body.fechaFin) : null,
          esExclusivoWeb: body.esExclusivoWeb ?? false,
          aplicaIVA: body.aplicaIVA ?? true,
          requiereCodigo: body.requiereCodigo ?? true,
          productosWeb: body.productosWeb?.length
            ? { create: body.productosWeb.map((p: number) => ({ productoId: p })) }
            : undefined,
          productosPadre: body.productosPadre?.length
            ? { create: body.productosPadre.map((p: number) => ({ productoId: p })) }
            : undefined,
          rubros: body.rubros?.length
            ? { create: body.rubros.map((r: number) => ({ rubroId: r })) }
            : undefined,
          subrubros: body.subrubros?.length
            ? { create: body.subrubros.map((s: number) => ({ subrubroId: s })) }
            : undefined,
        },
        include: {
          productosWeb: true,
          productosPadre: true,
          rubros: true,
          subrubros: true,
        },
      });

      res.status(201).json({ success: true, data: cupon, message: 'Cupón creado exitosamente' });
    } catch (error: any) {
      console.error('[CuponAdminController.crear] Error:', error);
      res.status(500).json({ success: false, error: 'Error al crear cupón', message: error.message });
    }
  }

  async actualizar(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).empresaId;
      const id = paramAsString(req.params.id);

      if (!empresaId) {
        return res.status(400).json({ success: false, error: 'Empresa no especificada' });
      }

      if (!id) {
        return res.status(400).json({ success: false, error: 'ID no especificado' });
      }

      const cuponId = parseInt(id, 10);

      const existing = await prisma.cupon.findFirst({
        where: { id: cuponId, empresaId },
      });

      if (!existing) {
        return res.status(404).json({ success: false, error: 'Cupón no encontrado' });
      }

      const body = req.body;

      if (body.codigo) {
        const codigoNuevo = String(body.codigo).toUpperCase();
        if (codigoNuevo !== existing.codigo) {
          const duplicado = await prisma.cupon.findFirst({
            where: { empresaId, codigo: codigoNuevo, id: { not: cuponId } },
          });
          if (duplicado) {
            return res.status(400).json({ success: false, error: 'Ya existe un cupón con este código' });
          }
        }
      }

      const valorDescuento = toOptionalDecimal(body.valorDescuento);
      const montoMinimo = toOptionalDecimal(body.montoMinimo);
      const montoMaximoDescuento = toOptionalDecimal(body.montoMaximoDescuento);
      const usoMaximo = toOptionalInt(body.usoMaximo);
      const usoMaximoUsuario = toOptionalInt(body.usoMaximoUsuario);

      await prisma.cupon.update({
        where: { id: cuponId },
        data: {
          ...(body.codigo && { codigo: String(body.codigo).toUpperCase() }),
          ...(body.nombre && { nombre: String(body.nombre) }),
          ...(body.descripcion !== undefined && { descripcion: body.descripcion || null }),
          ...(body.tipoDescuento && { tipoDescuento: body.tipoDescuento }),
          ...(valorDescuento !== undefined && { valorDescuento }),
          ...(body.alcance && { alcance: body.alcance }),
          ...(body.estado && { estado: body.estado }),
          ...(montoMinimo !== undefined && { montoMinimo }),
          ...(montoMaximoDescuento !== undefined && { montoMaximoDescuento }),
          ...(usoMaximo !== undefined && { usoMaximo }),
          ...(usoMaximoUsuario !== undefined && { usoMaximoUsuario }),
          ...(body.fechaInicio && { fechaInicio: new Date(body.fechaInicio) }),
          ...(body.fechaFin !== undefined && {
            fechaFin: body.fechaFin ? new Date(body.fechaFin) : null,
          }),
          ...(body.esExclusivoWeb !== undefined && { esExclusivoWeb: body.esExclusivoWeb }),
          ...(body.aplicaIVA !== undefined && { aplicaIVA: body.aplicaIVA }),
          ...(body.requiereCodigo !== undefined && { requiereCodigo: body.requiereCodigo }),
        },
      });

      if (body.productosWeb !== undefined) {
        await prisma.cuponProductoWeb.deleteMany({ where: { cuponId } });
        if (body.productosWeb.length) {
          await prisma.cuponProductoWeb.createMany({
            data: body.productosWeb.map((p: number) => ({ cuponId, productoId: p })),
          });
        }
      }

      if (body.productosPadre !== undefined) {
        await prisma.cuponProductoPadre.deleteMany({ where: { cuponId } });
        if (body.productosPadre.length) {
          await prisma.cuponProductoPadre.createMany({
            data: body.productosPadre.map((p: number) => ({ cuponId, productoId: p })),
          });
        }
      }

      if (body.rubros !== undefined) {
        await prisma.cuponRubro.deleteMany({ where: { cuponId } });
        if (body.rubros.length) {
          await prisma.cuponRubro.createMany({
            data: body.rubros.map((r: number) => ({ cuponId, rubroId: r })),
          });
        }
      }

      if (body.subrubros !== undefined) {
        await prisma.cuponSubrubro.deleteMany({ where: { cuponId } });
        if (body.subrubros.length) {
          await prisma.cuponSubrubro.createMany({
            data: body.subrubros.map((s: number) => ({ cuponId, subrubroId: s })),
          });
        }
      }

      const updated = await prisma.cupon.findUnique({
        where: { id: cuponId },
        include: { productosWeb: true, productosPadre: true, rubros: true, subrubros: true },
      });

      res.json({ success: true, data: updated, message: 'Cupón actualizado exitosamente' });
    } catch (error: any) {
      console.error('[CuponAdminController.actualizar] Error:', error);
      res.status(500).json({ success: false, error: 'Error al actualizar cupón', message: error.message });
    }
  }

  async eliminar(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).empresaId;
      const id = paramAsString(req.params.id);

      if (!empresaId) {
        return res.status(400).json({ success: false, error: 'Empresa no especificada' });
      }

      if (!id) {
        return res.status(400).json({ success: false, error: 'ID no especificado' });
      }

      const cuponId = parseInt(id, 10);

      const existing = await prisma.cupon.findFirst({
        where: { id: cuponId, empresaId },
      });

      if (!existing) {
        return res.status(404).json({ success: false, error: 'Cupón no encontrado' });
      }

      await prisma.cupon.delete({ where: { id: cuponId } });

      res.json({ success: true, message: 'Cupón eliminado exitosamente' });
    } catch (error: any) {
      console.error('[CuponAdminController.eliminar] Error:', error);
      res.status(500).json({ success: false, error: 'Error al eliminar cupón', message: error.message });
    }
  }
}