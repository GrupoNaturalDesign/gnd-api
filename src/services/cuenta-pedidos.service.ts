import { EstadoPedido, FormaPago, type Pedido, type PedidoItem, type PedidoSyncStatus } from '@prisma/client';
import prisma from '../lib/prisma';
import {
  getCustomerOrderStatusLabel,
  resolveCustomerOrderStatus,
  type CustomerOrderStatus,
} from '../utils/pedido-customer-status.util';
import { requiresPostalShipping } from '../utils/pedido-entrega.util';
import { resolvePedidoShippingTracking } from '../utils/pedido-shipping-tracking.util';
import type { ShippingProviderName } from './shipping/shipping.types';
import type { CuentaPedidosListQuery } from '../validation/cuenta-pedidos.validation';
import { abandonarCheckoutMp } from './mp-checkout.service';
import {
  computePedidoDescuentoTotal,
  computePedidoTotalNeto,
} from '../utils/pedido-totals.util';

export interface CuentaPedidoListItem {
  id: number;
  numero: string;
  fechaPedido: string;
  estado: CustomerOrderStatus;
  estadoLabel: string;
  formaPago: FormaPago | null;
  total: number;
  descuentoTotal: number;
  itemCount: number;
  trackingUrl: string | null;
  trackingNumber: string | null;
  shippingProvider: ShippingProviderName | null;
  requiresPostalShipping: boolean;
  canViewPaymentInstructions: boolean;
  syncStatus: PedidoSyncStatus;
  sfactoryOrdenId: number | null;
  sfactoryExternalOrderId: string | null;
}

export interface CuentaPedidoItemLine {
  id: number;
  productName: string;
  /** Slug de `ProductoPadre` para armar `/producto/[slug]`; ausente si el ítem no tiene enlace web. */
  productSlug?: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  especificaciones?: string;
}

export interface CuentaPedidoDetail extends CuentaPedidoListItem {
  items: CuentaPedidoItemLine[];
  observaciones: string | null;
}

type PedidoListRow = Pedido & {
  _count: { items: number };
};

type PedidoDetailRow = Pedido & {
  items: Array<
    PedidoItem & {
      productoPadre: { slug: string | null } | null;
    }
  >;
};

function formatNumero(id: number, externalId: string | null): string {
  if (externalId?.trim()) return externalId.trim();
  return `WEB-${id}`;
}

function canViewPaymentInstructions(pedido: Pedido): boolean {
  const manual =
    pedido.formaPago === FormaPago.transferencia || pedido.formaPago === FormaPago.efectivo;
  if (!manual) return false;
  return (
    pedido.estadoInterno === EstadoPedido.pendiente_pago ||
    pedido.estadoInterno === EstadoPedido.pendiente_confirmacion
  );
}

function mapItemLine(item: PedidoDetailRow['items'][number]): CuentaPedidoItemLine {
  const parts = [
    item.talle ? `Talle ${item.talle}` : null,
    item.color ?? null,
    item.bordado ? 'Bordado' : null,
  ].filter(Boolean);
  const espec = parts.length > 0 ? parts.join(' · ') : undefined;
  const slug = item.productoPadre?.slug?.trim();
  return {
    id: item.id,
    productName: item.nombre,
    ...(slug ? { productSlug: slug } : {}),
    quantity: Number(item.cantidad),
    unitPrice: Number(item.precioUnitario),
    subtotal: Number(item.subtotal),
    ...(espec ? { especificaciones: espec } : {}),
  };
}

function mapPedidoListItem(pedido: PedidoListRow): CuentaPedidoListItem {
  const estado = resolveCustomerOrderStatus(pedido);
  const postal = requiresPostalShipping(pedido);
  const tracking = resolvePedidoShippingTracking(pedido);
  return {
    id: pedido.id,
    numero: formatNumero(pedido.id, pedido.sfactoryExternalOrderId),
    fechaPedido: pedido.fechaPedido.toISOString(),
    estado,
    estadoLabel: getCustomerOrderStatusLabel(estado),
    formaPago: pedido.formaPago,
    total: computePedidoTotalNeto(pedido),
    descuentoTotal: computePedidoDescuentoTotal(pedido),
    itemCount: pedido._count.items,
    trackingUrl: tracking.trackingUrl ?? pedido.trackingUrl,
    trackingNumber: tracking.trackingNumber,
    shippingProvider: tracking.shippingProvider,
    requiresPostalShipping: postal,
    canViewPaymentInstructions: canViewPaymentInstructions(pedido),
    syncStatus: pedido.syncStatus,
    sfactoryOrdenId: pedido.sfactoryOrdenId,
    sfactoryExternalOrderId: pedido.sfactoryExternalOrderId,
  };
}

function mapPedidoDetail(pedido: PedidoDetailRow): CuentaPedidoDetail {
  const base = mapPedidoListItem({
    ...pedido,
    _count: { items: pedido.items.length },
  });
  return {
    ...base,
    observaciones: pedido.observaciones,
    items: pedido.items.map(mapItemLine),
  };
}

export async function resolveUsuarioIdByFirebaseUid(uid: string): Promise<number | null> {
  const usuario = await prisma.usuario.findFirst({
    where: { externalId: uid },
    select: { id: true },
  });
  return usuario?.id ?? null;
}

export class CuentaPedidosService {
  async listar(usuarioId: number, query: CuentaPedidosListQuery) {
    const where = {
      usuarioId,
      estadoInterno: { not: EstadoPedido.carrito },
    };

    const skip = (query.page - 1) * query.limit;
    const [total, rows] = await prisma.$transaction([
      prisma.pedido.count({ where }),
      prisma.pedido.findMany({
        where,
        orderBy: { fechaPedido: 'desc' },
        skip,
        take: query.limit,
        include: {
          _count: { select: { items: true } },
        },
      }),
    ]);

    return {
      data: rows.map(mapPedidoListItem),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }

  async detalle(usuarioId: number, pedidoId: number): Promise<CuentaPedidoDetail | null> {
    const pedido = await prisma.pedido.findFirst({
      where: {
        id: pedidoId,
        usuarioId,
        estadoInterno: { not: EstadoPedido.carrito },
      },
      include: {
        items: {
          orderBy: { id: 'asc' },
          include: {
            productoPadre: { select: { slug: true } },
          },
        },
      },
    });
    if (!pedido) return null;
    return mapPedidoDetail(pedido);
  }

  async abandonarCheckout(usuarioId: number, pedidoId: number): Promise<CuentaPedidoDetail | null> {
    await abandonarCheckoutMp(usuarioId, pedidoId);
    return this.detalle(usuarioId, pedidoId);
  }
}

export const cuentaPedidosService = new CuentaPedidosService();
