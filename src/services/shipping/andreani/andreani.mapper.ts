import type { Pedido } from '@prisma/client';
import type { CreateShippingOrderInput, ShippingAddress } from '../shipping.types';
import { ShippingValidationError } from '../shipping.errors';
import type { AndreaniOrdenEnvioResponse } from './andreani.types';
import {
  getAndreaniClienteCode,
  getAndreaniContratoDomicilio,
  getAndreaniContratoSucursal,
  getAndreaniSucursalClienteId,
  getAndreaniTipoDeServicio,
  loadAndreaniOrigenPostal,
  loadAndreaniRemitente,
} from './andreani.config';

/**
 * Arma el JSON de alta de orden de envío según API Andreani v2
 * (`tipoDeServicio`, `idPedido`, `origen.postal`, `remitente`, `destinatario[]` con `telefonos`,
 * `destino.postal` o `destino.sucursal`, `bultos` con montos e IVA explícitos).
 */
export function mapPedidoToAndreaniOrdenEnvio(
  input: CreateShippingOrderInput,
  pedido: Pedido
): Record<string, unknown> {
  if (!getAndreaniClienteCode()) {
    throw new ShippingValidationError('Configure ANDREANI_CLIENTE');
  }

  const contrato =
    input.deliveryType === 'homeDelivery'
      ? getAndreaniContratoDomicilio()
      : getAndreaniContratoSucursal();
  if (!contrato) {
    throw new ShippingValidationError(
      input.deliveryType === 'homeDelivery'
        ? 'Configure ANDREANI_CONTRATO_DOM'
        : 'Configure ANDREANI_CONTRATO_SUC'
    );
  }

  const p = input.parcel;
  const kilos = Math.max(0.001, p.weightGrams / 1000);
  const vd = p.declaredValue;
  const bulto = {
    kilos,
    altoCm: p.height,
    anchoCm: p.width,
    largoCm: p.depth,
    volumenCm: p.height * p.width * p.depth,
    valorDeclaradoSinImpuestos: vd,
    valorDeclaradoConImpuestos: vd,
  };

  const telRaw = (input.recipient.phone ?? pedido.clienteTelefono ?? '').trim();
  const telDigits = telRaw.replace(/\D/g, '');
  if (!telDigits) {
    throw new ShippingValidationError(
      'Destinatario: falta teléfono válido (recipient.phone o pedido.clienteTelefono)'
    );
  }

  const destinatario = {
    nombreCompleto: input.recipient.name,
    email: input.recipient.email ?? pedido.clienteEmail,
    documentoTipo: '',
    documentoNumero: '',
    telefonos: [{ tipo: 1, numero: telDigits }],
  };

  const base: Record<string, unknown> = {
    contrato,
    tipoDeServicio: getAndreaniTipoDeServicio(),
    sucursalClienteID: getAndreaniSucursalClienteId(),
    idPedido: `WEB-${pedido.id}`,
    origen: {
      postal: loadAndreaniOrigenPostal(),
    },
    remitente: loadAndreaniRemitente(),
    destinatario: [destinatario],
    bultos: [bulto],
  };

  if (input.deliveryType === 'agency') {
    const sid = input.agencyId ?? pedido.andreaniSucursalId;
    if (!sid) {
      throw new ShippingValidationError(
        'Envío a sucursal Andreani: falta agencyId o pedido.andreaniSucursalId'
      );
    }
    const sucursal: Record<string, string> = { id: String(sid) };
    const desc = pedido.andreaniSucursalDescripcion?.trim();
    if (desc) sucursal.descripcion = desc;
    return {
      ...base,
      destino: { sucursal },
    };
  }

  const addr = input.address;
  if (!addr) {
    throw new ShippingValidationError('Envío a domicilio: falta address');
  }

  return {
    ...base,
    destino: {
      postal: mapAddressToDestinoPostal(addr, pedido),
    },
  };
}

function mapAddressToDestinoPostal(
  addr: ShippingAddress,
  pedido: Pedido
): Record<string, string | unknown[]> {
  const zip = addr.zipCode || pedido.entregaCp || '';
  if (!zip) {
    throw new ShippingValidationError('Falta código postal de destino');
  }
  return {
    codigoPostal: zip,
    calle: addr.streetName,
    numero: addr.streetNumber,
    localidad: addr.city,
    region: addr.state,
    pais: 'Argentina',
    piso: addr.floor ?? '',
    departamento: addr.department ?? '',
    casillaDeCorreo: '',
    componentesDeDireccion: [],
  };
}

export function extractNumeroEnvioYAgrupador(
  data: AndreaniOrdenEnvioResponse
): { numeroEnvio: string; agrupador: string | null } {
  const agrupador =
    typeof data.agrupadorDeBultos === 'string' ? data.agrupadorDeBultos : null;
  const b0 = data.bultos?.[0];
  const numero =
    typeof b0?.numeroDeEnvio === 'string' ? b0.numeroDeEnvio : null;
  if (!numero) {
    throw new ShippingValidationError(
      'Respuesta Andreani sin numeroDeEnvio en bultos[0]; revisar contrato API'
    );
  }
  return { numeroEnvio: numero, agrupador };
}

function readNumericFromTarifaObject(t: Record<string, unknown>): number {
  for (const k of ['total', 'importe', 'monto', 'valor']) {
    const v = t[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const n = parseFloat(v.replace(',', '.'));
      if (Number.isFinite(n)) return n;
    }
  }
  return NaN;
}

export function extractPrecioCotizacion(data: unknown): number {
  if (data == null) return NaN;
  if (Array.isArray(data) && data.length > 0) {
    const n = extractPrecioCotizacion(data[0]);
    if (Number.isFinite(n)) return n;
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const o = data as Record<string, unknown>;
    if (typeof o.precio === 'number' && Number.isFinite(o.precio)) return o.precio;
    if (typeof o.importe === 'number' && Number.isFinite(o.importe)) return o.importe;
    if (typeof o.importeTotal === 'number' && Number.isFinite(o.importeTotal))
      return o.importeTotal;
    if (typeof o.tarifa === 'number' && Number.isFinite(o.tarifa)) return o.tarifa;

    const tcv = o.tarifaConIva;
    if (tcv && typeof tcv === 'object' && tcv !== null) {
      const n = readNumericFromTarifaObject(tcv as Record<string, unknown>);
      if (Number.isFinite(n)) return n;
    }
    const tsin = o.tarifaSinIva;
    if (tsin && typeof tsin === 'object' && tsin !== null) {
      const n = readNumericFromTarifaObject(tsin as Record<string, unknown>);
      if (Number.isFinite(n)) return n;
    }
  }
  return NaN;
}
