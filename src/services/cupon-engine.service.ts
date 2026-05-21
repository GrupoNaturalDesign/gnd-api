import prisma from '../lib/prisma';

export interface CarritoItem {
  productoId: number;
  productoWebId?: number;
  productoPadreId?: number;
  rubroId?: number;
  subrubroId?: number;
  cantidad: number;
  precioUnitario: number;
}

export interface CuponEvaluacionParams {
  empresaId: number;
  codigo: string;
  usuarioId?: number;
  clienteId?: number;
  items: CarritoItem[];
  subtotal: number;
}

export interface CuponDetalle {
  cuponId: number;
  codigo: string;
  nombre: string;
  tipoDescuento: string;
  valorDescuento: number;
  alcance: string;
  descuentoTotal: number;
  itemsAplicados: number;
  detallePorItem: {
    productoId: number;
    cantidad: number;
    precioOriginal: number;
    descuento: number;
    precioFinal: number;
  }[];
}

export interface CuponValidacionResultado {
  valido: boolean;
  error?: string;
  detalle?: CuponDetalle;
}

export class CuponEngineService {
  async validarCupon(params: CuponEvaluacionParams): Promise<CuponValidacionResultado> {
    const { empresaId, codigo, usuarioId, clienteId, items, subtotal } = params;

    const cupon = await prisma.cupon.findFirst({
      where: {
        empresaId,
        codigo: codigo.toUpperCase(),
        estado: 'activo',
      },
      include: {
        productosWeb: true,
        productosPadre: true,
        rubros: true,
        subrubros: true,
        usages: true,
      },
    });

    if (!cupon) {
      return { valido: false, error: 'Cupón no encontrado o inactivo' };
    }

    const ahora = new Date();
    if (ahora < cupon.fechaInicio) {
      return { valido: false, error: 'El cupón aún no está vigente' };
    }
    if (cupon.fechaFin && ahora > cupon.fechaFin) {
      return { valido: false, error: 'El cupón ha expirado' };
    }

    if (cupon.montoMinimo && subtotal < Number(cupon.montoMinimo)) {
      return {
        valido: false,
        error: `Monto mínimo requerido: $${Number(cupon.montoMinimo).toFixed(2)}`,
      };
    }

    if (cupon.usoMaximo) {
      const usoActual = await prisma.cuponUso.count({
        where: { cuponId: cupon.id },
      });
      if (usoActual >= cupon.usoMaximo) {
        return { valido: false, error: 'Cupón agotado (límite de usos alcanzado)' };
      }
    }

    if (cupon.usoMaximoUsuario && (usuarioId || clienteId)) {
      const usosUsuario = await prisma.cuponUso.count({
        where: {
          cuponId: cupon.id,
          OR: [
            { usuarioId: usuarioId ?? undefined },
            { clienteId: clienteId ?? undefined },
          ],
        },
      });
      if (usosUsuario >= cupon.usoMaximoUsuario) {
        return { valido: false, error: 'Ya has alcanzado el límite de usos de este cupón' };
      }
    }

    const itemsAplicables = this.filtrarItemsAplicables(cupon, items);
    if (itemsAplicables.length === 0) {
      return { valido: false, error: 'Ningún producto del carrito es aplicable a este cupón' };
    }

    const detalle = this.calcularDescuento(cupon, itemsAplicables, subtotal);

    return {
      valido: true,
      detalle,
    };
  }

  private filtrarItemsAplicables(
    cupon: any,
    items: CarritoItem[]
  ): CarritoItem[] {
    const alcance = cupon.alcance;

    if (alcance === 'carrito_completo') {
      return items;
    }

    if (alcance === 'productos_web') {
      const idsWeb = new Set(cupon.productosWeb.map((p: any) => p.productoId));
      return items.filter((item) => item.productoWebId && idsWeb.has(item.productoWebId));
    }

    if (alcance === 'productos_padre') {
      const idsPadre = new Set(cupon.productosPadre.map((p: any) => p.productoId));
      return items.filter((item) => item.productoPadreId && idsPadre.has(item.productoPadreId));
    }

    if (alcance === 'rubro') {
      const idsRubro = new Set(cupon.rubros.map((r: any) => r.rubroId));
      return items.filter((item) => item.rubroId && idsRubro.has(item.rubroId));
    }

    if (alcance === 'subrubro') {
      const idsSubrubro = new Set(cupon.subrubros.map((s: any) => s.subrubroId));
      return items.filter((item) => item.subrubroId && idsSubrubro.has(item.subrubroId));
    }

    return items;
  }

  private calcularDescuento(
    cupon: any,
    itemsAplicables: CarritoItem[],
    subtotal: number
  ): CuponDetalle {
    let descuentoTotal = 0;
    const detallePorItem: CuponDetalle['detallePorItem'] = [];

    for (const item of itemsAplicables) {
      const subtotalItem = item.precioUnitario * item.cantidad;
      let descuentoItem = 0;

      if (cupon.tipoDescuento === 'porcentaje') {
        descuentoItem = subtotalItem * (Number(cupon.valorDescuento) / 100);
      } else if (cupon.tipoDescuento === 'monto_fijo') {
        const proporcion = subtotalItem / subtotal;
        descuentoItem = Number(cupon.valorDescuento) * proporcion;
      }

      if (cupon.montoMaximoDescuento && descuentoItem > Number(cupon.montoMaximoDescuento)) {
        descuentoItem = Number(cupon.montoMaximoDescuento);
      }

      descuentoTotal += descuentoItem;

      detallePorItem.push({
        productoId: item.productoId,
        cantidad: item.cantidad,
        precioOriginal: subtotalItem,
        descuento: descuentoItem,
        precioFinal: subtotalItem - descuentoItem,
      });
    }

    descuentoTotal = Math.round(descuentoTotal * 100) / 100;

    const maxGlobal = cupon.montoMaximoDescuento ? Number(cupon.montoMaximoDescuento) : null;
    if (maxGlobal != null && descuentoTotal > maxGlobal) {
      const factor = maxGlobal / descuentoTotal;
      for (const row of detallePorItem) {
        row.descuento = Math.round(row.descuento * factor * 100) / 100;
        row.precioFinal = Math.round((row.precioOriginal - row.descuento) * 100) / 100;
      }
      descuentoTotal = Math.round(maxGlobal * 100) / 100;
    }

    return {
      cuponId: cupon.id,
      codigo: cupon.codigo,
      nombre: cupon.nombre,
      tipoDescuento: cupon.tipoDescuento,
      valorDescuento: Number(cupon.valorDescuento),
      alcance: cupon.alcance,
      descuentoTotal,
      itemsAplicados: itemsAplicables.length,
      detallePorItem,
    };
  }

  async aplicarCuponAPedido(
    pedidoId: number,
    detalle: CuponDetalle
  ): Promise<void> {
    await prisma.pedido.update({
      where: { id: pedidoId },
      data: {
        cuponId: detalle.cuponId,
        cuponCodigoSnapshot: detalle.codigo,
        cuponDescuentoTotal: detalle.descuentoTotal,
        cuponDetalleSnapshot: detalle as any,
      },
    });
  }

  async registrarUso(params: {
    cuponId: number;
    pedidoId: number;
    descuento: number;
    usuarioId?: number;
    clienteId?: number;
  }): Promise<void> {
    const { cuponId, pedidoId, descuento, usuarioId, clienteId } = params;
    await prisma.cuponUso.create({
      data: {
        cuponId,
        pedidoId,
        usuarioId: usuarioId ?? null,
        clienteId: clienteId ?? null,
        descuento,
      },
    });
  }
}