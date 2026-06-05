import { Prisma } from '@prisma/client';
import type { SFactoryProduct } from '../types/sfactory.types';
import { resolverColorDesdeSfactory } from './sfactory-color-parse.utils';
import {
  refrescarColoresDisponiblesPadres,
  resolverPublicadoPadreNuevo,
} from './padre-colores-sync.utils';
import { agruparProductosPorCodigoBase } from '../services/producto-agrupacion.service';
import { mapCodigoToAgrupacionCanonica, toSFactoryProductFromRow } from './sync-hash.utils';

export type FilaSfactoryRealign = {
  codigo: string;
  descripcion?: string | null;
  descrip_corta?: string | null;
  activo?: string | null;
  rubro?: string | null;
  subrubro?: string | null;
  linea?: string | null;
  material?: string | null;
  um?: string | null;
  precio_venta?: Prisma.Decimal | number | null;
  barcode?: string | null;
  sfactory_id?: number | null;
};

function slugPadre(nombre: string, codigoAgrupacion: string): string {
  return `${nombre}-${codigoAgrupacion}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 220);
}

type Tx = Prisma.TransactionClient;

/**
 * Mueve variantes al padre canónico y refresca color/colores_disponibles
 * (p. ej. Delantal Denim → L-WW-ACC-DEL-DENIM_U; WR AZUL MAR → AZUL MARINO).
 */
export async function realinearVariantesAgrupacionCanonica(
  tx: Tx,
  empresaId: number,
  productosSfactoryMap: Map<string, FilaSfactoryRealign>,
  rubroIdsEcommerce: number[]
): Promise<{ padresTocados: number; variantesMovidas: number; coloresActualizados: number }> {
  const websEcom = await tx.productoWeb.findMany({
    where: {
      empresaId,
      ...(rubroIdsEcommerce.length > 0 && {
        productoPadre: { rubroId: { in: rubroIdsEcommerce } },
      }),
    },
    select: { sfactoryCodigo: true },
  });
  const codigosWeb = [...new Set(websEcom.map((w) => w.sfactoryCodigo))];
  const mapCompleto = new Map(productosSfactoryMap);
  if (codigosWeb.length > 0) {
    const faltantes = codigosWeb.filter((c) => !mapCompleto.has(c));
    if (faltantes.length > 0) {
      const rowsExtra = await tx.productoSfactory.findMany({
        where: { empresaId, codigo: { in: faltantes } },
      });
      for (const r of rowsExtra) {
        mapCompleto.set(r.codigo, r);
      }
    }
  }

  const rows = [...mapCompleto.values()];
  if (rows.length === 0) {
    return { padresTocados: 0, variantesMovidas: 0, coloresActualizados: 0 };
  }

  const productos = rows.map((r) => toSFactoryProductFromRow(r));
  const grupos = agruparProductosPorCodigoBase(productos);
  const canonicoPorCodigo = mapCodigoToAgrupacionCanonica(grupos);
  const codigos = [...canonicoPorCodigo.keys()];
  if (codigos.length === 0) {
    return { padresTocados: 0, variantesMovidas: 0, coloresActualizados: 0 };
  }

  const agrupaciones = [...new Set(canonicoPorCodigo.values())];
  const padres = await tx.productoPadre.findMany({
    where: { empresaId, codigoAgrupacion: { in: agrupaciones } },
    select: { id: true, codigoAgrupacion: true },
  });
  const padreIdPorAgrup = new Map(padres.map((p) => [p.codigoAgrupacion, p.id]));

  const webs = await tx.productoWeb.findMany({
    where: {
      empresaId,
      sfactoryCodigo: { in: codigos },
      ...(rubroIdsEcommerce.length > 0 && {
        productoPadre: { rubroId: { in: rubroIdsEcommerce } },
      }),
    },
    select: {
      id: true,
      sfactoryCodigo: true,
      productoPadreId: true,
      color: true,
    },
  });

  let variantesMovidas = 0;
  let coloresActualizados = 0;
  const padresAfectados = new Set<number>();

  for (const w of webs) {
    const agrupEsperada = canonicoPorCodigo.get(w.sfactoryCodigo);
    if (!agrupEsperada) continue;

    let padreId = padreIdPorAgrup.get(agrupEsperada);
    if (!padreId) {
      const grupo = grupos.get(agrupEsperada);
      const nombre = grupo?.nombreBase || agrupEsperada;
      const publicado = await resolverPublicadoPadreNuevo(
        tx,
        empresaId,
        agrupEsperada
      );
      const creado = await tx.productoPadre.create({
        data: {
          empresaId,
          codigoAgrupacion: agrupEsperada,
          nombre,
          slug: slugPadre(nombre, agrupEsperada),
          genero: grupo?.sexo ?? 'Unisex',
          publicado,
        },
      });
      padreId = creado.id;
      padreIdPorAgrup.set(agrupEsperada, padreId);
    }

    const row = mapCompleto.get(w.sfactoryCodigo);
    const descripcion =
      row?.descripcion || row?.descrip_corta || w.sfactoryCodigo;
    const colorNuevo = resolverColorDesdeSfactory(
      descripcion,
      null,
      null,
      w.sfactoryCodigo
    );

    const data: { productoPadreId?: number; color?: string | null } = {};
    if (padreId !== w.productoPadreId) {
      data.productoPadreId = padreId;
      variantesMovidas++;
      padresAfectados.add(padreId);
      padresAfectados.add(w.productoPadreId);
    }
    if (colorNuevo && colorNuevo !== w.color) {
      data.color = colorNuevo;
      coloresActualizados++;
      padresAfectados.add(padreId);
    }

    if (Object.keys(data).length > 0) {
      await tx.productoWeb.update({ where: { id: w.id }, data });
    }
  }

  if (padresAfectados.size > 0 && rubroIdsEcommerce.length > 0) {
    await refrescarColoresDisponiblesPadres(
      tx,
      empresaId,
      rubroIdsEcommerce,
      [...padresAfectados]
    );
  }

  return {
    padresTocados: padresAfectados.size,
    variantesMovidas,
    coloresActualizados,
  };
}
