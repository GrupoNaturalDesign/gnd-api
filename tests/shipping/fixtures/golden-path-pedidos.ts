import { Prisma, EstadoPedido, FormaPago } from '@prisma/client';
import type { Pedido, PedidoItem } from '@prisma/client';
import type { CheckoutEnvioSnapshot } from '../../../src/utils/pedido-entrega.util';
import { buildParcelFromShippingLines } from '../../../src/utils/shipping-parcel.util';

export const GOLDEN_EMPRESA_ID = 1;
export const GOLDEN_PEDIDO_ANDREANI_ID = 8801;
export const GOLDEN_PEDIDO_CORREO_ID = 8802;
export const GOLDEN_PEDIDO_RETIRO_ID = 8803;
/** Manual transferencia + envío postal, pendiente de aprobación admin. */
export const GOLDEN_PEDIDO_MANUAL_POSTAL_ID = 8804;

/** Snapshot como lo persiste checkout tras cotizar Andreani domicilio. */
export const andreaniHomeSnapshot: CheckoutEnvioSnapshot = {
  version: 1,
  provider: 'andreani',
  deliveryType: 'homeDelivery',
  cpDestino: '5000',
  clientQuotedAmount: 7041.21,
  address: {
    streetName: 'Av. Colón',
    streetNumber: '100',
    city: 'Córdoba',
    state: 'Córdoba',
    zipCode: '5000',
  },
};

/** Snapshot Correo retiro sucursal (como en checkout). */
export const correoAgencySnapshot: CheckoutEnvioSnapshot = {
  version: 1,
  provider: 'correo',
  deliveryType: 'agency',
  cpDestino: '5000',
  agencyId: 'COR-SUC-001',
  agencyLabel: 'Sucursal Centro Córdoba',
  clientQuotedAmount: 1234,
};

export const goldenCamisaItem = {
  productoWebId: 101,
  codigo: 'L-OF-CAM-JOY2',
  cantidad: new Prisma.Decimal(1),
};

export const goldenSfactoryCamisaRow = {
  codigo: 'L-OF-CAM-JOY2',
  peso_bruto: new Prisma.Decimal(350),
  ancho: new Prisma.Decimal(40),
  largo: new Prisma.Decimal(40),
  subrubro: 'CAMISA',
};

export const goldenProductoWebRow = {
  id: 101,
  sfactoryCodigo: 'L-OF-CAM-JOY2',
};

/** Bulto esperado para ítem camisa (misma lógica que prod vía buildParcelFromShippingLines). */
export function expectedGoldenParcel(declaredValue = 48400) {
  process.env.SHIPPING_ALTO_POR_PRENDA_CM = process.env.SHIPPING_ALTO_POR_PRENDA_CM ?? '8';
  return buildParcelFromShippingLines(
    [
      {
        codigo: 'L-OF-CAM-JOY2',
        cantidad: 1,
        pesoGrams: 350,
        anchoCm: 40,
        largoCm: 40,
        subrubro: 'CAMISA',
      },
    ],
    declaredValue
  );
}

function basePedidoFields(id: number): Pick<
  Pedido,
  | 'id'
  | 'empresaId'
  | 'clienteNombre'
  | 'clienteEmail'
  | 'clienteTelefono'
  | 'clienteDireccion'
  | 'entregaCp'
  | 'subtotal'
  | 'total'
  | 'costoEnvio'
  | 'andreaniSucursalId'
  | 'andreaniNumeroEnvio'
  | 'correoTrackingNumber'
  | 'trackingUrl'
  | 'checkoutEnvioSnapshot'
  | 'formaEnvio'
> {
  return {
    id,
    empresaId: GOLDEN_EMPRESA_ID,
    clienteNombre: 'Juan Pérez',
    clienteEmail: 'juan.perez@example.com',
    clienteTelefono: '3515551234',
    clienteDireccion: 'Av. Colón 100, Córdoba',
    entregaCp: '5000',
    subtotal: new Prisma.Decimal(40000),
    total: new Prisma.Decimal(48400),
    costoEnvio: new Prisma.Decimal(1500),
    andreaniSucursalId: null,
    andreaniNumeroEnvio: null,
    correoTrackingNumber: null,
    trackingUrl: null,
    checkoutEnvioSnapshot: null,
    formaEnvio: null,
  };
}

export function buildAndreaniHomePedido(): Pedido {
  return {
    ...basePedidoFields(GOLDEN_PEDIDO_ANDREANI_ID),
    checkoutEnvioSnapshot: andreaniHomeSnapshot as unknown as Prisma.JsonValue,
    formaEnvio: 'andreani_domicilio',
  } as Pedido;
}

export function buildCorreoAgencyPedido(): Pedido {
  return {
    ...basePedidoFields(GOLDEN_PEDIDO_CORREO_ID),
    checkoutEnvioSnapshot: correoAgencySnapshot as unknown as Prisma.JsonValue,
    formaEnvio: 'correo_sucursal',
  } as Pedido;
}

export function buildRetiroPedido(): Pedido {
  return {
    ...basePedidoFields(GOLDEN_PEDIDO_RETIRO_ID),
    costoEnvio: new Prisma.Decimal(0),
    checkoutEnvioSnapshot: null,
    formaEnvio: null,
    entregaCp: null,
    clienteDireccion: null,
  } as Pedido;
}

/** Transferencia/efectivo + Andreani domicilio, recién creado en web (pre-aprobación admin). */
export function buildManualPostalPedidoPending(): Pedido {
  return {
    ...buildAndreaniHomePedido(),
    id: GOLDEN_PEDIDO_MANUAL_POSTAL_ID,
    estadoInterno: EstadoPedido.pendiente_confirmacion,
    formaPago: FormaPago.transferencia,
    stockReservadoWeb: true,
    sfactoryOrdenId: null,
    sfactoryExternalOrderId: null,
    sfactoryEstado: null,
    sfactorySnapshot: null,
    usuarioId: 1,
    clienteId: 1,
    fechaPedido: new Date('2026-07-01T15:00:00.000Z'),
    descuento: new Prisma.Decimal(0),
    iva: new Prisma.Decimal(0),
    observaciones: null,
    entregaNotas: null,
    refCliente: null,
    numOrdenCompra: null,
    cuponId: null,
    cuponCodigoSnapshot: null,
    cuponDetalleSnapshot: null,
    syncStatus: 'pending',
    expiresAt: new Date('2026-07-11T15:00:00.000Z'),
  } as Pedido;
}

export function goldenPedidoItems(pedidoId: number): PedidoItem[] {
  return [
    {
      id: pedidoId * 10,
      pedidoId,
      productoWebId: 101,
      productoPadreId: 1,
      sfactoryItemId: 501,
      nombre: 'Camisa Joy',
      codigo: 'L-OF-CAM-JOY2',
      cantidad: new Prisma.Decimal(1),
      precioUnitario: new Prisma.Decimal(40000),
      descuento: new Prisma.Decimal(0),
      subtotal: new Prisma.Decimal(40000),
      talle: 'M',
      color: 'Azul',
      bordado: false,
    } as PedidoItem,
  ];
}

export const goldenEmpresaRow = {
  id: GOLDEN_EMPRESA_ID,
  sfactoryCompanyKey: 'golden-company-key',
};

export const goldenClienteRow = {
  id: 1,
  cuit: '20-12345678-9',
  email: 'juan.perez@example.com',
  razonSocial: 'Juan Pérez',
  telefono: '3515551234',
};

export function makeGoldenEnvioConfig(providerDefault: 'andreani' | 'correo') {
  return {
    id: 1,
    empresaId: GOLDEN_EMPRESA_ID,
    providerDefault,
    correoApiKey: null,
    correoAgreement: null,
    correoServiceType: null,
    correoSenderData: { name: 'GND Natural Design' },
    correoAccountEmail: 'cuenta@test.com',
    correoAccountPasswordEnc: 'enc-pass',
    correoCustomerId: 'CUST-GOLDEN',
    correoAccountStatus: 'active',
    correoAccountValidatedAt: new Date(),
    correoAccountLastError: null,
    correoOriginCp: '5000',
    correoOriginProvinceCode: 'X',
    correoEnv: 'test',
    andreaniEnv: 'test',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
