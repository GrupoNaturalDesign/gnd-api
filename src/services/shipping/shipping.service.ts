import type { EmpresaEnvioConfig } from '@prisma/client';
import { FormaEnvio, Prisma } from '@prisma/client';
import prisma from '../../lib/prisma';
import { shippingLogger } from '../../lib/shipping-logger';
import { CorreoProvider } from './correo/correo.provider';
import { AndreaniProvider } from './andreani/andreani.provider';
import type { ShippingProvider } from './shipping.provider';
import type {
  AgencyFilters,
  CreateShippingOrderInput,
  ShippingAgency,
  ShippingDeliveryType,
  ShippingLabel,
  ShippingOrderResult,
  ShippingParcel,
  ShippingProviderName,
  ShippingTrackingResult,
} from './shipping.types';
import type { AndreaniCotizacionResultado } from './andreani/andreani.types';
import type { CorreoShippingQuote } from './correo/correo.types';
import {
  getAndreaniClienteCode,
  getAndreaniContratoDomicilio,
  getAndreaniContratoSucursal,
  getAndreaniSucursalOrigen,
} from './andreani/andreani.config';
import { mapEmpresaCorreoEnv } from './correo/correo.config';
import {
  ShippingConfigError,
  ShippingHttpError,
  ShippingMethodNotSupportedError,
  ShippingValidationError,
} from './shipping.errors';

function toJsonValue(v: unknown): Prisma.InputJsonValue | undefined {
  if (v === undefined) return undefined;
  return JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
}

function parseProviderDefault(raw: string): ShippingProviderName {
  if (raw === 'andreani') return 'andreani';
  return 'correo';
}

function mapFormaEnvio(
  provider: ShippingProviderName,
  deliveryType: ShippingDeliveryType
): FormaEnvio {
  if (provider === 'andreani') {
    return deliveryType === 'homeDelivery'
      ? FormaEnvio.andreani_domicilio
      : FormaEnvio.andreani_sucursal;
  }
  return deliveryType === 'homeDelivery'
    ? FormaEnvio.correo_domicilio
    : FormaEnvio.correo_sucursal;
}

export class ShippingService {
  private readonly andreaniProviders = new Map<string, AndreaniProvider>();
  private readonly correoProviders = new Map<string, CorreoProvider>();

  private getCorreoProvider(config: EmpresaEnvioConfig): CorreoProvider {
    const key = `${config.empresaId}::${config.correoEnv}`;
    let p = this.correoProviders.get(key);
    if (!p) {
      p = new CorreoProvider(
        config.correoSenderData,
        mapEmpresaCorreoEnv(config.correoEnv),
        globalThis.fetch.bind(globalThis)
      );
      this.correoProviders.set(key, p);
    }
    return p;
  }

  private getAndreaniProvider(config: EmpresaEnvioConfig): AndreaniProvider {
    const key = `${config.empresaId}::${config.andreaniEnv}`;
    let p = this.andreaniProviders.get(key);
    if (!p) {
      p = new AndreaniProvider(config.andreaniEnv);
      this.andreaniProviders.set(key, p);
    }
    return p;
  }

  private buildProvider(
    name: ShippingProviderName,
    config: EmpresaEnvioConfig
  ): ShippingProvider {
    if (name === 'andreani') {
      return this.getAndreaniProvider(config);
    }
    if (name === 'correo') {
      return this.getCorreoProvider(config);
    }
    throw new ShippingConfigError(`Proveedor de envío no soportado: ${name}`);
  }

  private async getOrCreateEnvioConfig(empresaId: number): Promise<EmpresaEnvioConfig> {
    const existing = await prisma.empresaEnvioConfig.findUnique({
      where: { empresaId },
    });
    if (existing) return existing;
    const defProvider = parseProviderDefault(
      process.env.SHIPPING_DEFAULT_PROVIDER ?? 'correo'
    );
    const correoEnv =
      process.env.CORREO_DEFAULT_ENV === 'prod' ? 'prod' : 'test';
    const andreaniEnv =
      process.env.ANDREANI_DEFAULT_ENV === 'prod' ? 'prod' : 'test';
    return prisma.empresaEnvioConfig.create({
      data: {
        empresaId,
        providerDefault: defProvider,
        correoEnv,
        andreaniEnv,
      },
    });
  }

  private async logBefore(
    pedidoId: number | null,
    operacion: string,
    provider: string,
    payload: unknown
  ): Promise<void> {
    await prisma.pedidoEnvioLog.create({
      data: {
        pedidoId: pedidoId ?? undefined,
        operacion: `${operacion}_before`,
        provider,
        payload: toJsonValue(payload),
        exitoso: true,
      },
    });
  }

  private async logAfter(
    pedidoId: number | null,
    operacion: string,
    provider: string,
    response: unknown,
    exitoso: boolean,
    errorMessage: string | null,
    httpStatus: number | null
  ): Promise<void> {
    await prisma.pedidoEnvioLog.create({
      data: {
        pedidoId: pedidoId ?? undefined,
        operacion: `${operacion}_after`,
        provider,
        response: toJsonValue(response),
        exitoso,
        error: errorMessage ?? undefined,
        httpStatus: httpStatus ?? undefined,
      },
    });
  }

  async createOrder(input: CreateShippingOrderInput): Promise<ShippingOrderResult> {
    const pedido = await prisma.pedido.findFirst({
      where: { id: input.pedidoId, empresaId: input.empresaId },
    });
    if (!pedido) {
      throw new ShippingValidationError(
        'Pedido no encontrado o no pertenece a la empresa'
      );
    }

    const config = await this.getOrCreateEnvioConfig(input.empresaId);
    const providerName =
      input.provider ?? parseProviderDefault(config.providerDefault);

    await this.logBefore(input.pedidoId, 'create_order', providerName, input);

    try {
      const provider = this.buildProvider(providerName, config);
      const result = await provider.createOrder(input);

      await prisma.pedido.update({
        where: { id: input.pedidoId },
        data: {
          ...(result.provider === 'correo'
            ? { correoTrackingNumber: result.trackingNumber }
            : {
              andreaniNumeroEnvio: result.trackingNumber,
              ...(result.andreaniAgrupadorBultos != null && result.andreaniAgrupadorBultos !== ''
                ? { andreaniAgrupadorBultos: result.andreaniAgrupadorBultos }
                : {}),
            }),
          formaEnvio: mapFormaEnvio(providerName, input.deliveryType),
        },
      });

      await this.logAfter(
        input.pedidoId,
        'create_order',
        providerName,
        result,
        true,
        null,
        null
      );
      shippingLogger.info('create_order OK', {
        pedidoId: input.pedidoId,
        provider: providerName,
        trackingNumber: result.trackingNumber,
      });
      return result;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const status = e instanceof ShippingHttpError ? e.status : null;
      await this.logAfter(
        input.pedidoId,
        'create_order',
        providerName,
        null,
        false,
        msg,
        status
      );
      throw e;
    }
  }

  async cancelOrder(
    pedidoId: number,
    trackingNumber: string,
    provider: ShippingProviderName,
    empresaId: number
  ): Promise<void> {
    const pedido = await prisma.pedido.findFirst({
      where: { id: pedidoId, empresaId },
    });
    if (!pedido) {
      throw new ShippingValidationError(
        'Pedido no encontrado o no pertenece a la empresa'
      );
    }
    const config = await this.getOrCreateEnvioConfig(empresaId);
    await this.logBefore(pedidoId, 'cancel_order', provider, { trackingNumber });
    try {
      const p = this.buildProvider(provider, config);
      await p.cancelOrder(trackingNumber);
      await this.logAfter(pedidoId, 'cancel_order', provider, { ok: true }, true, null, null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const status = e instanceof ShippingHttpError ? e.status : null;
      await this.logAfter(pedidoId, 'cancel_order', provider, null, false, msg, status);
      throw e;
    }
  }

  async getLabel(
    pedidoId: number,
    trackingNumber: string,
    provider: ShippingProviderName,
    empresaId: number
  ): Promise<ShippingLabel> {
    const pedido = await prisma.pedido.findFirst({
      where: { id: pedidoId, empresaId },
    });
    if (!pedido) {
      throw new ShippingValidationError(
        'Pedido no encontrado o no pertenece a la empresa'
      );
    }
    const config = await this.getOrCreateEnvioConfig(empresaId);
    await this.logBefore(pedidoId, 'get_label', provider, { trackingNumber });
    try {
      const p = this.buildProvider(provider, config);
      const label = await p.getLabel(trackingNumber, {
        pedidoId,
        empresaId,
      });
      await this.logAfter(
        pedidoId,
        'get_label',
        provider,
        { trackingNumber: label.trackingNumber, fileName: label.fileName },
        true,
        null,
        null
      );
      return label;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const status = e instanceof ShippingHttpError ? e.status : null;
      await this.logAfter(pedidoId, 'get_label', provider, null, false, msg, status);
      throw e;
    }
  }

  async getTracking(
    pedidoId: number,
    trackingNumbers: string[],
    provider: ShippingProviderName,
    empresaId: number
  ): Promise<ShippingTrackingResult[]> {
    const pedido = await prisma.pedido.findFirst({
      where: { id: pedidoId, empresaId },
    });
    if (!pedido) {
      throw new ShippingValidationError(
        'Pedido no encontrado o no pertenece a la empresa'
      );
    }
    const config = await this.getOrCreateEnvioConfig(empresaId);
    await this.logBefore(pedidoId, 'get_tracking', provider, { trackingNumbers });
    try {
      const p = this.buildProvider(provider, config);
      const results = await p.getTracking(trackingNumbers);
      await this.logAfter(
        pedidoId,
        'get_tracking',
        provider,
        { count: results.length },
        true,
        null,
        null
      );
      return results;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const status = e instanceof ShippingHttpError ? e.status : null;
      await this.logAfter(pedidoId, 'get_tracking', provider, null, false, msg, status);
      throw e;
    }
  }

  async getAgencies(
    empresaId: number,
    provider: ShippingProviderName,
    filters: AgencyFilters
  ): Promise<ShippingAgency[]> {
    const config = await this.getOrCreateEnvioConfig(empresaId);
    await this.logBefore(null, 'get_agencies', provider, filters);
    try {
      const p = this.buildProvider(provider, config);
      const list = await p.getAgencies(filters);
      await this.logAfter(
        null,
        'get_agencies',
        provider,
        { count: list.length },
        true,
        null,
        null
      );
      return list;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const status = e instanceof ShippingHttpError ? e.status : null;
      await this.logAfter(null, 'get_agencies', provider, null, false, msg, status);
      throw e;
    }
  }

  /** Resuelve el proveedor por defecto de la empresa (p. ej. query sin `provider`). */
  async resolveDefaultProvider(empresaId: number): Promise<ShippingProviderName> {
    const config = await this.getOrCreateEnvioConfig(empresaId);
    return parseProviderDefault(config.providerDefault);
  }

  /**
   * Cotización Andreani (checkout). Requiere variables ANDREANI_CLIENTE y contrato según tipo de entrega.
   */
  async quoteAndreani(params: {
    empresaId: number;
    cpDestino: string;
    deliveryType: ShippingDeliveryType;
    parcel: ShippingParcel;
    provider?: ShippingProviderName;
  }): Promise<AndreaniCotizacionResultado> {
    const config = await this.getOrCreateEnvioConfig(params.empresaId);
    const prov = params.provider ?? parseProviderDefault(config.providerDefault);
    if (prov !== 'andreani') {
      throw new ShippingValidationError('La cotización implementada es solo para provider andreani');
    }
    const cliente = getAndreaniClienteCode();
    if (!cliente) {
      throw new ShippingValidationError('Configure ANDREANI_CLIENTE');
    }
    const contrato =
      params.deliveryType === 'homeDelivery'
        ? getAndreaniContratoDomicilio()
        : getAndreaniContratoSucursal();
    if (!contrato) {
      throw new ShippingValidationError(
        params.deliveryType === 'homeDelivery'
          ? 'Configure ANDREANI_CONTRATO_DOM'
          : 'Configure ANDREANI_CONTRATO_SUC'
      );
    }
    const p = this.getAndreaniProvider(config);
    const par = params.parcel;
    const volumenCm3 = par.height * par.width * par.depth;
    const suc = getAndreaniSucursalOrigen();
    return p.cotizarEnvio({
      cpDestino: params.cpDestino.trim(),
      contrato,
      cliente,
      sucursalOrigen: suc || undefined,
      bultos: [
        {
          volumenCm3,
          kilos: par.weightGrams / 1000,
          valorDeclarado: par.declaredValue,
          altoCm: par.height,
          largoCm: par.depth,
          anchoCm: par.width,
        },
      ],
    });
  }

  /**
   * Cotización MiCorreo (checkout). Requiere `CORREO_ORIGIN_CP` y credenciales Correo.
   */
  async quoteCorreo(params: {
    empresaId: number;
    cpDestino: string;
    deliveryType: ShippingDeliveryType;
    parcel: ShippingParcel;
  }): Promise<CorreoShippingQuote[]> {
    const origin = process.env.CORREO_ORIGIN_CP?.trim();
    if (!origin) {
      throw new ShippingValidationError('Configure CORREO_ORIGIN_CP');
    }
    const config = await this.getOrCreateEnvioConfig(params.empresaId);
    const p = this.getCorreoProvider(config);
    const par = params.parcel;
    const deliveredType = params.deliveryType === 'agency' ? 'S' : 'D';
    return p.getQuote({
      postalCodeOrigin: origin,
      postalCodeDestination: params.cpDestino.trim(),
      dimensions: {
        weight: par.weightGrams,
        height: par.height,
        width: par.width,
        length: par.depth,
      },
      deliveredType,
    });
  }
}

export const shippingService = new ShippingService();
