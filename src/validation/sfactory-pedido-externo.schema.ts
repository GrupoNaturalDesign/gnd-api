import { z } from 'zod';
import type {
  SFactoryCrearPedidoExternoParams,
  SFactoryPedidoExternoCliente,
  SFactoryPedidoExternoItem,
} from '../types/sfactory.types';
import { resolveSfactoryPedidoFulfillmentMode } from '../utils/sfactory-pedido-externo.util';

const dateYmd = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Debe ser YYYY-MM-DD')
  .max(10);

const ivaValues = z.union([
  z.literal(0),
  z.literal(10.5),
  z.literal(21),
  z.literal(27),
]);

/** Cliente: SFactory resuelve por CUIT (11 dígitos) o email. */
export const sfactoryPedidoExternoClienteSchema = z
  .object({
    nombre: z.string().min(1).max(500).optional(),
    cuit: z.string().max(20).optional(),
    email: z.string().max(255).optional(),
    razon_social: z.string().min(1).max(500).optional(),
    telefono: z.string().max(80).optional(),
    movil: z.string().max(80).optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    const cuitDigits = val.cuit?.replace(/\D/g, '') ?? '';
    const hasValidCuit = cuitDigits.length === 11;
    if (val.cuit != null && val.cuit.trim() !== '' && !hasValidCuit) {
      ctx.addIssue({
        code: 'custom',
        path: ['cuit'],
        message: 'cuit debe tener exactamente 11 dígitos (se ignoran guiones)',
      });
    }
    const emailTrim = val.email?.trim() ?? '';
    const emailOk = emailTrim.length > 0 && z.string().email().safeParse(emailTrim).success;
    if (!hasValidCuit && !emailOk) {
      ctx.addIssue({
        code: 'custom',
        message: 'Se requiere cuit válido (11 dígitos) o email válido',
      });
    }
  });

export const sfactoryPedidoExternoItemSchema = z
  .object({
    sku: z.string().min(1).max(100),
    cantidad: z.number().positive().finite().max(1_000_000),
    precio: z.number().nonnegative().finite().optional(),
    descuento: z.number().min(0).max(100).finite().optional(),
    iva: ivaValues.optional(),
    descripcion: z.string().max(500).optional(),
    fecha_entrega: dateYmd.optional(),
    especificaciones: z.string().max(2000).optional(),
    notas: z.string().max(2000).optional(),
  })
  .strict();

export const sfactoryPedidoExternoEntregaSchema = z
  .object({
    provincia: z.string().min(1).max(120),
    localidad: z.string().min(1).max(200),
    direccion: z.string().min(1).max(500),
    cp: z.string().min(1).max(20),
    localidad_id: z.number().int().positive().optional(),
    notas: z.string().max(2000).optional(),
  })
  .strict();

export const sfactoryCrearPedidoExternoBodySchema = z
  .object({
    /** Si se omite, se usa `SFACTORY_PEDIDO_EXTERNO_SOURCE`. */
    source: z.string().min(1).max(100).optional(),
    ext_order_id: z.string().min(1).max(120),
    fecha: dateYmd.optional(),
    fecha_entrega: dateYmd.optional(),
    titulo: z.string().max(200).optional(),
    observaciones: z.string().max(5000).optional(),
    ref_cliente: z.string().max(200).optional(),
    num_orden_compra: z.string().max(200).optional(),
    condiciones_venta: z.string().max(200).optional(),
    cliente: sfactoryPedidoExternoClienteSchema,
    items: z.array(sfactoryPedidoExternoItemSchema).min(1).max(500),
    entrega: sfactoryPedidoExternoEntregaSchema.optional(),
    fulfillment_mode: z.enum(['none', 'reserve', 'deliver']).optional(),
    shipping_type: z.string().min(1).max(100).optional(),
  })
  .strict();

export type SFactoryCrearPedidoExternoValidated = z.infer<
  typeof sfactoryCrearPedidoExternoBodySchema
>;

/** Normaliza cliente (cuit solo dígitos, email trim) para el payload a SFactory. */
export function toSfactoryPedidoExternoParams(
  body: SFactoryCrearPedidoExternoValidated
): SFactoryCrearPedidoExternoParams {
  const c = body.cliente;
  const cuitDigits = c.cuit?.replace(/\D/g, '') ?? '';
  const cuit = cuitDigits.length === 11 ? cuitDigits : undefined;
  const email = c.email?.trim() || undefined;

  const cliente: SFactoryPedidoExternoCliente = {
    ...(c.nombre ? { nombre: c.nombre } : {}),
    ...(cuit ? { cuit } : {}),
    ...(email ? { email } : {}),
    ...(c.razon_social ? { razon_social: c.razon_social } : {}),
    ...(c.telefono ? { telefono: c.telefono } : {}),
    ...(c.movil ? { movil: c.movil } : {}),
  };

  const items: SFactoryPedidoExternoItem[] = body.items.map((it) => {
    const row: SFactoryPedidoExternoItem = {
      sku: it.sku.trim(),
      cantidad: it.cantidad,
      ...(it.precio !== undefined ? { precio: it.precio } : {}),
      ...(it.descuento !== undefined ? { descuento: it.descuento } : {}),
      ...(it.iva !== undefined ? { iva: it.iva } : {}),
      ...(it.descripcion ? { descripcion: it.descripcion } : {}),
      ...(it.fecha_entrega ? { fecha_entrega: it.fecha_entrega } : {}),
      ...(it.especificaciones ? { especificaciones: it.especificaciones } : {}),
      ...(it.notas ? { notas: it.notas } : {}),
    };
    return row;
  });

  const tuple = items as [
    SFactoryPedidoExternoItem,
    ...SFactoryPedidoExternoItem[],
  ];

  const source =
    body.source?.trim() || process.env.SFACTORY_PEDIDO_EXTERNO_SOURCE?.trim() || '';
  if (!source) {
    throw new Error(
      'Falta source / SFACTORY_PEDIDO_EXTERNO_SOURCE (debe coincidir con external_orders_config en SFactory).'
    );
  }

  return {
    source,
    ext_order_id: body.ext_order_id.trim(),
    ...(body.fecha ? { fecha: body.fecha } : {}),
    ...(body.fecha_entrega ? { fecha_entrega: body.fecha_entrega } : {}),
    ...(body.titulo ? { titulo: body.titulo } : {}),
    ...(body.observaciones ? { observaciones: body.observaciones } : {}),
    ...(body.ref_cliente ? { ref_cliente: body.ref_cliente } : {}),
    ...(body.num_orden_compra ? { num_orden_compra: body.num_orden_compra } : {}),
    ...(body.condiciones_venta ? { condiciones_venta: body.condiciones_venta } : {}),
    cliente,
    items: tuple,
    fulfillment_mode: body.fulfillment_mode ?? resolveSfactoryPedidoFulfillmentMode(),
    ...(body.shipping_type ? { shipping_type: body.shipping_type.trim() } : {}),
    ...(body.entrega ? { entrega: body.entrega } : {}),
  };
}
