import { OrderStatus } from '@prisma/client';
import { z } from 'zod';
import { consumerEmailSchema } from './consumer-email.zod';

export const contactBodySchema = z.object({
  nombreCompleto: z
    .string()
    .max(50)
    .regex(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]*$/, 'El nombre solo puede contener letras y espacios')
    .optional(),
  email: z.string().email().min(1).max(100),
  empresa: z.string().min(2).max(100),
  telefono: z.string().min(8).max(20),
  mensaje: z.string().min(10).max(1000),
  aceptaTerminos: z.literal(true),
});

const checkoutEnvioSchema = z
  .object({
    provider: z.enum(['correo', 'andreani']),
    deliveryType: z.enum(['homeDelivery', 'agency']),
    parcel: z.object({
      weightGrams: z.number(),
      height: z.number(),
      width: z.number(),
      depth: z.number(),
      declaredValue: z.number(),
    }),
    cpDestino: z.string(),
    clientQuotedAmount: z.number(),
    correoProductType: z.string().optional(),
    agencyId: z.string().optional(),
    agencyLabel: z.string().optional(),
  })
  .passthrough();

const shippingDataSchema = z
  .object({
    tipo: z.enum(['envio', 'retiro']),
    direccion: z.string().optional(),
    localidad: z.string().optional(),
    provincia: z.string().optional(),
    codigo_postal: z.string().optional(),
    notas: z.string().optional(),
    fecha_entrega: z.string().optional(),
    checkoutProvider: z.enum(['correo', 'andreani']).optional(),
    checkoutDelivery: z.enum(['homeDelivery', 'agency']).optional(),
    checkoutEnvio: checkoutEnvioSchema.optional(),
  })
  .passthrough();

const cartProductSchema = z.object({
  id: z.number(),
  productoWebId: z.number().optional(),
  productoPadreId: z.number().optional(),
  sfactoryItemId: z.number().optional(),
  codigo: z.string().optional(),
  nombre: z.string(),
  descripcion: z.string().optional(),
  categoria: z.string().optional(),
  precio: z.number(),
  precioLista: z.number().optional(),
  imagen: z.string().optional(),
});

const cartItemSchema = z.object({
  product: cartProductSchema,
  quantity: z.number(),
  subtotal: z.number(),
  subtotalTransfer: z.number().optional(),
  subtotalSinImp: z.number().optional(),
  especificaciones: z.string().optional(),
  bordado: z.boolean().optional(),
});

export const orderConfirmationBodySchema = z.object({
  to: z.string().email(),
  subject: z.string().optional(),
  customerData: z.object({
    nombre: z.string(),
    apellido: z.string(),
    email: z.string().email(),
    telefono: z.string(),
    empresa: z.string().optional(),
    cuit: z.string().optional(),
    fecha_nacimiento: z.string().optional(),
    documento: z.string().optional(),
    tipo_documento: z.enum(['DNI', 'CUIT', 'CUIL']).optional(),
  }),
  shippingData: shippingDataSchema.optional().nullable(),
  paymentData: z
    .object({
      metodo: z.string(),
      notas: z.string().optional(),
    })
    .optional()
    .nullable(),
  items: z.array(cartItemSchema).min(1),
  itemCount: z.number(),
  subtotal: z.number(),
  iva: z.number(),
  total: z.number(),
});

export type OrderConfirmationBody = z.infer<typeof orderConfirmationBodySchema>;

export const erpOrderStatusBodySchema = z.object({
  pedidoId: z.number().int().positive(),
  status: z.nativeEnum(OrderStatus),
});

export const newsletterSendBodySchema = z.object({
  subject: z.string().min(1).max(500),
  /** HTML del cuerpo (panel admin). */
  content: z.string().min(1),
  recipientList: z.array(z.string().email()).min(1).max(500).optional(),
});

export const subscribeBodySchema = z.object({
  email: consumerEmailSchema.max(255),
});

export const subscribersQuerySchema = z.object({
  page: z.coerce.number().int().positive().max(1000).default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const emailLogsQuerySchema = z.object({
  page: z.coerce.number().int().positive().max(1000).default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  type: z.string().optional(),
  status: z.enum(['sent', 'failed']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
