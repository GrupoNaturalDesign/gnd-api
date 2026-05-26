// src/jobs/pedido-checkout.jobs.ts
import {
  reintentarFallidosSfactory,
  procesarPedidosVencidos,
} from '../services/pedido-checkout.service';
import { reconciliarPedidosMpAtascados } from '../services/mp-checkout.service';
import { sfactoryAuthService } from '../services/sfactory/sfactory-auth.service';
import { pedidoSyncService } from '../services/pedido-sync.service';

const FIFTEEN_MIN = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;
const FIVE_MIN = 5 * 60 * 1000;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function getEmpresaIdForJobs(): Promise<number | null> {
  try {
    return await sfactoryAuthService.getEmpresaId();
  } catch (e) {
    console.error('[pedido-checkout-jobs] No se pudo resolver empresaId:', e);
    return null;
  }
}

export function startPedidoCheckoutJobs(): void {
  if (process.env.PEDIDO_CHECKOUT_JOBS_ENABLED === 'false') {
    console.log('[pedido-checkout-jobs] Deshabilitados (PEDIDO_CHECKOUT_JOBS_ENABLED=false)');
    return;
  }

  // En desarrollo no ejecutar por defecto: ahorra conexiones al MySQL remoto (límite por hora del hosting).
  if (
    process.env.PEDIDO_CHECKOUT_JOBS_ENABLED !== 'true' &&
    (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test')
  ) {
    console.log(
      '[pedido-checkout-jobs] Omitidos en desarrollo (set PEDIDO_CHECKOUT_JOBS_ENABLED=true para activar)'
    );
    return;
  }

  const runRetry = () => {
    reintentarFallidosSfactory().catch((e) =>
      console.error('[pedido-checkout-jobs] reintentarFallidosSfactory:', e)
    );
  };
  const runExpire = () => {
    procesarPedidosVencidos().catch((e) =>
      console.error('[pedido-checkout-jobs] procesarPedidosVencidos:', e)
    );
  };
  const runMpReconcile = () => {
    reconciliarPedidosMpAtascados().catch((e) =>
      console.error('[pedido-checkout-jobs] reconciliarPedidosMpAtascados:', e)
    );
    procesarPedidosVencidos().catch((e) =>
      console.error('[pedido-checkout-jobs] procesarPedidosVencidos (mp job):', e)
    );
  };
  const runPedidoSync = async () => {
    const empresaId = await getEmpresaIdForJobs();
    if (!empresaId) return;
    const limit = envInt('PEDIDO_SFACTORY_SYNC_LIMIT', 50);
    try {
      const result = await pedidoSyncService.syncPedidosActivosDesdeSfactory(empresaId, limit);
      console.log('[pedido-checkout-jobs] sync pedidos SFactory:', result);
    } catch (e) {
      console.error('[pedido-checkout-jobs] syncPedidosActivosDesdeSfactory:', e);
    }
  };
  const runStockSync = async () => {
    if (process.env.PEDIDO_STOCK_SYNC_ENABLED === 'false') return;
    const empresaId = await getEmpresaIdForJobs();
    if (!empresaId) return;
    try {
      const result = await pedidoSyncService.syncStockDesdeSfactory(empresaId);
      console.log('[pedido-checkout-jobs] sync stock SFactory:', result);
    } catch (e) {
      console.error('[pedido-checkout-jobs] syncStockDesdeSfactory:', e);
    }
  };

  setInterval(runRetry, FIFTEEN_MIN);
  setInterval(runExpire, FIFTEEN_MIN);
  setInterval(runMpReconcile, envInt('MP_RECONCILE_INTERVAL_MS', FIVE_MIN));
  setInterval(runPedidoSync, envInt('PEDIDO_SFACTORY_SYNC_INTERVAL_MS', FIVE_MIN));
  setInterval(runStockSync, envInt('PEDIDO_STOCK_SYNC_INTERVAL_MS', ONE_HOUR));

  setTimeout(runRetry, 30_000);
  setTimeout(runExpire, 60_000);
  setTimeout(runMpReconcile, 75_000);
  setTimeout(runPedidoSync, 90_000);
  setTimeout(runStockSync, 120_000);

  console.log(
    '[pedido-checkout-jobs] Programados: reintentos SFactory cada 15 min, vencimiento MP cada 15 min, reconcile MP cada 5 min, sync pedidos y stock SFactory'
  );
}
