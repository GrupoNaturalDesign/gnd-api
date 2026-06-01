// src/controllers/checkout.controller.ts
import { Request, Response } from 'express';
import type { FirebaseAuthRequest } from '../middleware/firebase-auth.middleware';
import prisma from '../lib/prisma';
import { getCheckoutEmpresaIdFromEnv } from '../lib/checkout-empresa';
import type { ApiResponse } from '../types';
import { crearPedidoMp, crearPedidoManual, getCheckoutMpPaymentStatus, type CrearPedidoMpInput, type CrearPedidoManualInput } from '../services/mp-checkout.service';
import type { CheckoutEnvioClientPayload } from '../services/checkout-shipping.service';
import {
  ShippingConfigError,
  ShippingHttpError,
  ShippingValidationError,
} from '../services/shipping/shipping.errors';
import { empresaDatosBancariosService } from '../services/empresa-datos-bancarios.service';
import { empresaConfigService } from '../services/empresa-config.service';
import { getInstruccionesPagoForPedido } from '../services/pedido-payment-instructions.service';

function parseParcelForCheckout(raw: unknown): CheckoutEnvioClientPayload['parcel'] | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const weightGrams = Number(p.weightGrams);
  const height = Number(p.height);
  const width = Number(p.width);
  const depth = Number(p.depth);
  const declaredValue = Number(p.declaredValue);
  if (
    !Number.isFinite(weightGrams) ||
    weightGrams <= 0 ||
    !Number.isFinite(height) ||
    height <= 0 ||
    !Number.isFinite(width) ||
    width <= 0 ||
    !Number.isFinite(depth) ||
    depth <= 0 ||
    !Number.isFinite(declaredValue) ||
    declaredValue < 0
  ) {
    return null;
  }
  return { weightGrams, height, width, depth, declaredValue };
}

function parseAddressForCheckout(raw: unknown): CheckoutEnvioClientPayload['address'] | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const a = raw as Record<string, unknown>;
  const streetName = typeof a.streetName === 'string' ? a.streetName.trim() : '';
  const streetNumber = typeof a.streetNumber === 'string' ? a.streetNumber.trim() : '';
  const city = typeof a.city === 'string' ? a.city.trim() : '';
  const state = typeof a.state === 'string' ? a.state.trim() : '';
  const zipCode = typeof a.zipCode === 'string' ? a.zipCode.trim() : '';
  if (!streetName || !city || !state || !zipCode) return undefined;
  const floor = typeof a.floor === 'string' ? a.floor.trim() : undefined;
  const department = typeof a.department === 'string' ? a.department.trim() : undefined;
  return {
    streetName,
    streetNumber: streetNumber || 's/n',
    city,
    state,
    zipCode,
    ...(floor ? { floor } : {}),
    ...(department ? { department } : {}),
  };
}

/** Body opcional `checkoutEnvio` al iniciar MP; validación exhaustiva en servidor. */
function parseCheckoutEnvio(raw: unknown): CheckoutEnvioClientPayload | null {
  if (raw == null) return null;
  if (typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const provider = o.provider;
  const deliveryType = o.deliveryType;
  if (provider !== 'correo' && provider !== 'andreani') return null;
  if (deliveryType !== 'homeDelivery' && deliveryType !== 'agency') return null;
  const parcel = parseParcelForCheckout(o.parcel);
  if (!parcel) return null;
  const cpDestino = typeof o.cpDestino === 'string' ? o.cpDestino.trim() : '';
  if (cpDestino.length < 2) return null;
  const clientQuotedAmount = Number(o.clientQuotedAmount);
  if (!Number.isFinite(clientQuotedAmount) || clientQuotedAmount < 0) return null;
  const agencyId = typeof o.agencyId === 'string' ? o.agencyId.trim() : undefined;
  const agencyLabel = typeof o.agencyLabel === 'string' ? o.agencyLabel.trim() : undefined;
  const correoProductTypeRaw = o.correoProductType;
  const correoProductType =
    typeof correoProductTypeRaw === 'string' && correoProductTypeRaw.trim()
      ? correoProductTypeRaw.trim()
      : undefined;
  if (deliveryType === 'agency' && !agencyId) return null;
  const address = parseAddressForCheckout(o.address);
  if (deliveryType === 'homeDelivery' && !address) return null;
  return {
    provider,
    deliveryType,
    parcel,
    cpDestino,
    clientQuotedAmount,
    ...(correoProductType ? { correoProductType } : {}),
    ...(agencyId ? { agencyId } : {}),
    ...(agencyLabel ? { agencyLabel } : {}),
    ...(address ? { address } : {}),
  };
}

export class CheckoutController {
  /** GET /api/checkout/resultado — back_urls de Mercado Pago (público). */
  resultado(_req: Request, res: Response): void {
    const response: ApiResponse = {
      success: true,
      message: 'Resultado recibido',
    };
    res.status(200).json(response);
  }

  /** GET /api/checkout/payment-status/:pedidoId — polling estado MP (Firebase). */
  async paymentStatusMp(req: FirebaseAuthRequest, res: Response): Promise<void> {
    try {
      const uid = req.uid;
      if (!uid) {
        res.status(401).json({ success: false, error: 'No autenticado.' });
        return;
      }

      const usuario = await prisma.usuario.findFirst({
        where: { externalId: uid },
        select: { id: true },
      });
      if (!usuario) {
        res.status(404).json({
          success: false,
          error: 'Usuario no encontrado en la base local.',
        });
        return;
      }

      const raw = req.params['pedidoId'];
      const pedidoId = parseInt(String(raw), 10);
      if (!Number.isFinite(pedidoId) || pedidoId <= 0) {
        res.status(400).json({ success: false, error: 'pedidoId inválido' });
        return;
      }

      const data = await getCheckoutMpPaymentStatus(pedidoId, usuario.id);
      if (!data) {
        res.status(404).json({ success: false, error: 'Pedido no encontrado' });
        return;
      }

      const response: ApiResponse = { success: true, data };
      res.json(response);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({
        success: false,
        error: 'Error al consultar estado de pago',
        message,
      });
    }
  }

  /** POST /api/checkout/mp — inicia pago con preferencia MP (requiere Firebase). */
  async iniciarPagoMp(req: FirebaseAuthRequest, res: Response): Promise<void> {
    try {
      const uid = req.uid;
      if (!uid) {
        res.status(401).json({ success: false, error: 'No autenticado.' });
        return;
      }

      const usuario = await prisma.usuario.findFirst({
        where: { externalId: uid },
        select: { id: true },
      });
      if (!usuario) {
        res.status(404).json({
          success: false,
          error: 'Usuario no encontrado en la base local.',
        });
        return;
      }

      const body = req.body as Partial<CrearPedidoMpInput>;
      const items = Array.isArray(body.items) ? body.items : [];
      const clienteNombre =
        typeof body.clienteNombre === 'string' ? body.clienteNombre.trim() : '';
      const clienteEmail =
        typeof body.clienteEmail === 'string' ? body.clienteEmail.trim() : '';

      if (items.length === 0 || !clienteNombre || !clienteEmail) {
        res.status(400).json({
          success: false,
          error: 'Faltan datos obligatorios',
          message: 'Se requiere items (no vacío), clienteNombre y clienteEmail.',
        });
        return;
      }

      const empresaId = getCheckoutEmpresaIdFromEnv();

      const mappedItems = items.map((raw: unknown) => {
        const it = raw as Record<string, unknown>;
        const productoWebId = Number(it.productoWebId);
        const productoPadreId = Number(it.productoPadreId);
        const sfactoryItemId = Number(it.sfactoryItemId);
        const cantidad = Number(it.cantidad);
        const precioUnitario = Number(it.precioUnitario);
        return {
          productoWebId,
          productoPadreId,
          sfactoryItemId,
          nombre: String(it.nombre ?? ''),
          codigo: String(it.codigo ?? ''),
          cantidad,
          precioUnitario,
          talle: typeof it.talle === 'string' ? it.talle : undefined,
          color: typeof it.color === 'string' ? it.color : undefined,
        };
      });

      for (const row of mappedItems) {
        if (
          !Number.isFinite(row.productoWebId) ||
          !Number.isFinite(row.productoPadreId) ||
          !Number.isFinite(row.sfactoryItemId) ||
          !Number.isFinite(row.cantidad) ||
          row.cantidad <= 0 ||
          !Number.isFinite(row.precioUnitario) ||
          row.precioUnitario < 0 ||
          !row.nombre.trim() ||
          !row.codigo.trim()
        ) {
          res.status(400).json({
            success: false,
            error: 'Ítem inválido',
            message: 'Revise ids numéricos, cantidad > 0, precio y nombre/código por línea.',
          });
          return;
        }
      }

      let checkoutEnvio: CheckoutEnvioClientPayload | undefined;
      if (body.checkoutEnvio !== undefined && body.checkoutEnvio !== null) {
        const parsed = parseCheckoutEnvio(body.checkoutEnvio);
        if (!parsed) {
          res.status(400).json({
            success: false,
            error: 'checkoutEnvio inválido',
            message:
              'Revisá proveedor, tipo de entrega, bulto, CP, monto cotizado y sucursal si aplica.',
          });
          return;
        }
        checkoutEnvio = parsed;
      }

      const input: CrearPedidoMpInput = {
        empresaId,
        clienteNombre,
        clienteEmail,
        clienteTelefono:
          typeof body.clienteTelefono === 'string' ? body.clienteTelefono : undefined,
        clienteDireccion:
          typeof body.clienteDireccion === 'string' ? body.clienteDireccion : undefined,
        observaciones:
          typeof body.observaciones === 'string' ? body.observaciones : undefined,
        items: mappedItems,
        checkoutEnvio,
        cuponCodigo:
          typeof body.cuponCodigo === 'string' ? body.cuponCodigo.trim() || undefined : undefined,
      };

      const data = await crearPedidoMp(input, usuario.id);

      const response: ApiResponse = {
        success: true,
        data: {
          pedidoId: data.pedidoId,
          checkoutUrl: data.checkoutUrl,
          preferenceId: data.preferenceId,
        },
        message: 'Preferencia creada',
      };
      res.json(response);
    } catch (error: unknown) {
      if (error instanceof ShippingValidationError || error instanceof ShippingConfigError) {
        res.status(400).json({
          success: false,
          error: 'Envío',
          message: error.message,
        });
        return;
      }
      if (error instanceof ShippingHttpError) {
        const st = error.status >= 400 && error.status < 600 ? error.status : 502;
        res.status(st).json({
          success: false,
          error: 'Proveedor de envío',
          message: error.message,
        });
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({
        success: false,
        error: 'Error al iniciar pago',
        message,
      });
    }
  }

  async iniciarPagoManual(req: FirebaseAuthRequest, res: Response): Promise<void> {
    try {
      const uid = req.uid;
      if (!uid) {
        res.status(401).json({ success: false, error: 'No autenticado.' });
        return;
      }

      const usuario = await prisma.usuario.findFirst({
        where: { externalId: uid },
        select: { id: true },
      });
      if (!usuario) {
        res.status(404).json({
          success: false,
          error: 'Usuario no encontrado en la base local.',
        });
        return;
      }

      const body = req.body as Partial<CrearPedidoManualInput>;
      const items = Array.isArray(body.items) ? body.items : [];
      const clienteNombre =
        typeof body.clienteNombre === 'string' ? body.clienteNombre.trim() : '';
      const clienteEmail =
        typeof body.clienteEmail === 'string' ? body.clienteEmail.trim() : '';
      const formaPago = body.formaPago;

      if (items.length === 0 || !clienteNombre || !clienteEmail) {
        res.status(400).json({
          success: false,
          error: 'Faltan datos obligatorios',
          message: 'Se requiere items (no vacío), clienteNombre, clienteEmail y formaPago.',
        });
        return;
      }

      if (formaPago !== 'efectivo' && formaPago !== 'transferencia') {
        res.status(400).json({
          success: false,
          error: 'Forma de pago inválida',
          message: 'formaPago debe ser "efectivo" o "transferencia".',
        });
        return;
      }

      const empresaId = getCheckoutEmpresaIdFromEnv();

      const mappedItems = items.map((raw: unknown) => {
        const it = raw as Record<string, unknown>;
        const productoWebId = Number(it.productoWebId);
        const productoPadreId = Number(it.productoPadreId);
        const sfactoryItemId = Number(it.sfactoryItemId);
        const cantidad = Number(it.cantidad);
        const precioUnitario = Number(it.precioUnitario);
        return {
          productoWebId,
          productoPadreId,
          sfactoryItemId,
          nombre: String(it.nombre ?? ''),
          codigo: String(it.codigo ?? ''),
          cantidad,
          precioUnitario,
          talle: typeof it.talle === 'string' ? it.talle : undefined,
          color: typeof it.color === 'string' ? it.color : undefined,
        };
      });

      for (const row of mappedItems) {
        if (
          !Number.isFinite(row.productoWebId) ||
          !Number.isFinite(row.productoPadreId) ||
          !Number.isFinite(row.sfactoryItemId) ||
          !Number.isFinite(row.cantidad) ||
          row.cantidad <= 0 ||
          !Number.isFinite(row.precioUnitario) ||
          row.precioUnitario < 0 ||
          !row.nombre.trim() ||
          !row.codigo.trim()
        ) {
          res.status(400).json({
            success: false,
            error: 'Ítem inválido',
            message: 'Revise ids numéricos, cantidad > 0, precio y nombre/código por línea.',
          });
          return;
        }
      }

      let checkoutEnvio: CheckoutEnvioClientPayload | undefined;
      if (body.checkoutEnvio !== undefined && body.checkoutEnvio !== null) {
        const parsed = parseCheckoutEnvio(body.checkoutEnvio);
        if (!parsed) {
          res.status(400).json({
            success: false,
            error: 'checkoutEnvio inválido',
            message:
              'Revisá proveedor, tipo de entrega, bulto, CP, monto cotizado y sucursal si aplica.',
          });
          return;
        }
        checkoutEnvio = parsed;
      }

      const input: CrearPedidoManualInput = {
        empresaId,
        clienteNombre,
        clienteEmail,
        clienteTelefono:
          typeof body.clienteTelefono === 'string' ? body.clienteTelefono : undefined,
        clienteDireccion:
          typeof body.clienteDireccion === 'string' ? body.clienteDireccion : undefined,
        observaciones:
          typeof body.observaciones === 'string' ? body.observaciones : undefined,
        items: mappedItems,
        formaPago: formaPago as 'efectivo' | 'transferencia',
        checkoutEnvio,
        entregaCp: checkoutEnvio?.cpDestino,
        andreaniSucursalId: checkoutEnvio?.agencyId,
        andreaniSucursalDescripcion: checkoutEnvio?.agencyLabel,
        cuponCodigo:
          typeof body.cuponCodigo === 'string' ? body.cuponCodigo.trim() || undefined : undefined,
      };

      const data = await crearPedidoManual(input, usuario.id);

      const response: ApiResponse = {
        success: true,
        data: {
          pedidoId: data.pedidoId,
          externalOrderId: data.externalOrderId,
          formaPago: data.formaPago,
          redirectPath: data.redirectPath,
        },
        message: 'Pedido creado exitosamente. Waiting for confirmation.',
      };
      res.json(response);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({
        success: false,
        error: 'Error al crear pedido',
        message,
      });
    }
  }

  /** GET /api/checkout/config-precios — config de precios pública para la tienda. */
  async getPrecioConfigPublic(_req: Request, res: Response): Promise<void> {
    try {
      const empresaId = getCheckoutEmpresaIdFromEnv();
      const config = await empresaConfigService.getPrecioConfig(empresaId);
      res.json({
        success: true,
        data: {
          descuentoTransferencia: config.descuentoTransferencia,
          iva: config.iva,
          cuotasFinanciado: config.cuotasFinanciado,
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener configuración de precios',
        message,
      });
    }
  }

  /** GET /api/checkout/datos-bancarios — datos públicos para transferencia. */
  async getDatosBancariosPublic(_req: Request, res: Response): Promise<void> {
    try {
      const empresaId = getCheckoutEmpresaIdFromEnv();
      const data = await empresaDatosBancariosService.getDatosBancariosPublic(empresaId);
      res.json({ success: true, data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener datos bancarios',
        message,
      });
    }
  }

  /** GET /api/checkout/pedido/:pedidoId/instrucciones-pago — landing post checkout manual. */
  async getInstruccionesPago(req: FirebaseAuthRequest, res: Response): Promise<void> {
    try {
      const uid = req.uid;
      if (!uid) {
        res.status(401).json({ success: false, error: 'No autenticado.' });
        return;
      }

      const usuario = await prisma.usuario.findFirst({
        where: { externalId: uid },
        select: { id: true },
      });
      if (!usuario) {
        res.status(404).json({
          success: false,
          error: 'Usuario no encontrado en la base local.',
        });
        return;
      }

      const raw = req.params['pedidoId'];
      const pedidoId = parseInt(String(raw), 10);
      if (!Number.isFinite(pedidoId) || pedidoId <= 0) {
        res.status(400).json({ success: false, error: 'pedidoId inválido' });
        return;
      }

      const data = await getInstruccionesPagoForPedido(pedidoId, usuario.id);
      if (!data) {
        res.status(404).json({ success: false, error: 'Pedido no encontrado' });
        return;
      }

      res.json({ success: true, data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener instrucciones de pago',
        message,
      });
    }
  }
}

export const checkoutController = new CheckoutController();
