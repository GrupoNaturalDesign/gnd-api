import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import type { SFactoryProduct } from '../types/sfactory.types';
import { agruparProductosPorCodigoBase } from '../services/producto-agrupacion.service';

/** SHA-256 estable sobre JSON (mismo patrón que pedido-sync). */
export function stableHash(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function decimalsEqual(
  a: Prisma.Decimal | number | string | null | undefined,
  b: Prisma.Decimal | number | string | null | undefined
): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  const na = Number(a);
  const nb = Number(b);
  if (Number.isNaN(na) || Number.isNaN(nb)) return false;
  return Math.abs(na - nb) < 0.0001;
}

export type ProductoSfactoryHashInput = {
  codigo: string;
  barcode?: string | null;
  descrip_corta?: string | null;
  descripcion?: string | null;
  precio_venta?: Prisma.Decimal | number | string | null;
  activo?: string | null;
  rubro_id?: number | null;
  subrubro_id?: number | null;
  linea?: string | null;
  material?: string | null;
  sfactory_id?: number | null;
};

export function hashProductoSfactoryFields(datos: ProductoSfactoryHashInput): string {
  return stableHash({
    codigo: datos.codigo,
    barcode: datos.barcode ?? null,
    descrip_corta: datos.descrip_corta ?? null,
    descripcion: datos.descripcion ?? null,
    precio_venta: datos.precio_venta != null ? Number(datos.precio_venta) : null,
    activo: datos.activo ?? null,
    rubro_id: datos.rubro_id ?? null,
    subrubro_id: datos.subrubro_id ?? null,
    linea: datos.linea ?? null,
    material: datos.material ?? null,
    sfactory_id: datos.sfactory_id ?? null,
  });
}

export type ProductoPadreHashInput = {
  nombre: string;
  descripcion?: string | null;
  rubroId?: number | null;
  subrubroId?: number | null;
  linea?: string | null;
  material?: string | null;
  um?: string | null;
  coloresDisponibles?: unknown;
  tallesDisponibles?: unknown;
  genero?: string | null;
};

export function hashProductoPadreFields(datos: ProductoPadreHashInput): string {
  return stableHash({
    nombre: datos.nombre,
    descripcion: datos.descripcion ?? '',
    rubroId: datos.rubroId ?? null,
    subrubroId: datos.subrubroId ?? null,
    linea: datos.linea ?? null,
    material: datos.material ?? null,
    um: datos.um ?? null,
    coloresDisponibles: datos.coloresDisponibles ?? null,
    tallesDisponibles: datos.tallesDisponibles ?? null,
    genero: datos.genero ?? null,
  });
}

export type ProductoWebHashInput = {
  productoPadreId: number;
  sfactoryId: number;
  sfactoryBarcode?: string | null;
  nombre: string;
  sexo?: string | null;
  talle?: string | null;
  color?: string | null;
  precioCache?: number | null;
  stockCache?: number | null;
  activoSfactory: boolean;
};

export function hashProductoWebFields(datos: ProductoWebHashInput): string {
  return stableHash({
    productoPadreId: datos.productoPadreId,
    sfactoryId: datos.sfactoryId,
    sfactoryBarcode: datos.sfactoryBarcode ?? null,
    nombre: datos.nombre,
    sexo: datos.sexo ?? null,
    talle: datos.talle ?? null,
    color: datos.color ?? null,
    precioCache: datos.precioCache ?? null,
    stockCache: datos.stockCache ?? null,
    activoSfactory: datos.activoSfactory,
  });
}

export type ClienteHashInput = {
  sfactoryId?: number | null;
  sfactoryCodigo?: string | null;
  razonSocial: string;
  nombre?: string | null;
  cuit?: string | null;
  tipo?: string | null;
  activo: boolean;
  email?: string | null;
  telefono?: string | null;
  movil?: string | null;
  domicilioFiscal?: string | null;
  localidadId?: number | null;
  provinciaId?: number | null;
  paisId?: number | null;
  cpFiscal?: string | null;
  categoriaFiscal?: string | null;
  codigoExterno?: string | null;
};

export function hashClienteFields(datos: ClienteHashInput): string {
  return stableHash({
    sfactoryId: datos.sfactoryId ?? null,
    sfactoryCodigo: datos.sfactoryCodigo ?? null,
    razonSocial: datos.razonSocial,
    nombre: datos.nombre ?? null,
    cuit: datos.cuit ?? null,
    tipo: datos.tipo ?? null,
    activo: datos.activo,
    email: datos.email ?? null,
    telefono: datos.telefono ?? null,
    movil: datos.movil ?? null,
    domicilioFiscal: datos.domicilioFiscal ?? null,
    localidadId: datos.localidadId ?? null,
    provinciaId: datos.provinciaId ?? null,
    paisId: datos.paisId ?? null,
    cpFiscal: datos.cpFiscal ?? null,
    categoriaFiscal: datos.categoriaFiscal ?? null,
    codigoExterno: datos.codigoExterno ?? null,
  });
}

export type StockPrecioLocal = {
  stockCache: Prisma.Decimal | number | string | null | undefined;
  precioCache: Prisma.Decimal | number | string | null | undefined;
};

export type StockPrecioRemote = {
  stock: number;
  saleOk: number | null;
};

export type StockPrecioUpdateDecision = {
  skip: boolean;
  updateStock: boolean;
  updatePrecio: boolean;
};

/** Decide si hay que escribir stock/precio en BD tras consulta a S-Factory. */
export function shouldUpdateStockPrecio(
  local: StockPrecioLocal,
  remote: StockPrecioRemote
): StockPrecioUpdateDecision {
  const stockChanged = !decimalsEqual(local.stockCache, remote.stock);
  const precioChanged =
    remote.saleOk != null && !decimalsEqual(local.precioCache, remote.saleOk);

  if (!stockChanged && !precioChanged) {
    return { skip: true, updateStock: false, updatePrecio: false };
  }

  return {
    skip: false,
    updateStock: stockChanged,
    updatePrecio: precioChanged,
  };
}

type ProductoSfactoryRow = {
  codigo: string;
  descripcion?: string | null;
  descrip_corta?: string | null;
  rubro?: string | null;
  subrubro?: string | null;
  linea?: string | null;
  material?: string | null;
  um?: string | null;
  precio_venta?: Prisma.Decimal | number | null;
  barcode?: string | null;
  activo?: string | null;
  sfactory_id?: number | null;
};

/** Convierte fila productos_sfactory al formato mínimo para agrupación. */
export function toSFactoryProductFromRow(p: ProductoSfactoryRow): SFactoryProduct {
  const activo = p.activo || 'S';
  return {
    Codigo: p.codigo,
    Descripcion: p.descripcion || p.descrip_corta || p.codigo,
    Rubro: p.rubro || null,
    Subrubro: p.subrubro || null,
    Linea: p.linea || null,
    Material: p.material || null,
    UM: p.um || null,
    PrecioVenta: p.precio_venta != null ? Number(p.precio_venta) : null,
    Stock: null,
    Barcode: p.barcode || null,
    Activo: activo === 'S',
    id: p.sfactory_id || undefined,
    Color: null,
    Talle: null,
  } as SFactoryProduct;
}

/**
 * Dado un set de códigos afectados, resuelve codigoAgrupacion a reprocesar en paso 2.
 */
export function resolveGruposAfectados(
  codigosAfectados: Set<string>,
  productosSfactoryByCodigo: Map<string, ProductoSfactoryRow>,
  codigoAgrupacionByCodigo?: Map<string, string>
): Set<string> {
  const grupos = new Set<string>();

  for (const codigo of codigosAfectados) {
    const fromWeb = codigoAgrupacionByCodigo?.get(codigo);
    if (fromWeb) {
      grupos.add(fromWeb);
      continue;
    }

    const row = productosSfactoryByCodigo.get(codigo);
    if (!row) continue;

    const agrupados = agruparProductosPorCodigoBase([toSFactoryProductFromRow(row)]);
    for (const [, grupo] of agrupados) {
      grupos.add(grupo.codigoAgrupacion);
    }
  }

  return grupos;
}
