/**
 * Formatea un ProductoPadre (con productosWeb) a ProductoPublicado.
 * Misma lógica para listados, destacados y relacionados.
 */

import type { ProductoPublicado, VariantePublicada } from '../types';
import { calcularTodosLosPrecios, CUOTAS_FINANCIADO_DEFAULT } from '../config/precios.config';
import { buildPrecioPublico } from '../services/precios-derivados.service';
import { deduplicateProductosWeb } from './variante-dedup.utils';
import {
  firstPadreImagenUrl,
  padreImagenForColor,
  type PadreImagenRow,
} from './producto-imagen.util';

export function formatProductoPadreToPublicado(
  producto: any,
  padreImagenRows: PadreImagenRow[],
): ProductoPublicado {
  const p = producto as any;
  const variantesActivas = deduplicateProductosWeb(p.productosWeb || []) as any[];

  const preciosProductoPrecio = variantesActivas
    .flatMap((v: any) => v.precios || [])
    .filter((precio: any): boolean => Number(precio.precioLista) > 0);

  const preciosCache = variantesActivas
    .map((v: any): number => Number(v.precioCache || 0))
    .filter((precio: number): boolean => precio > 0);

  let precioLista: number | null = null;
  let precioTransfer: number | null = null;
  let precioSinImp: number | null = null;

  if (preciosProductoPrecio.length > 0) {
    const precioMinPrecio = Math.min(
      ...preciosProductoPrecio.map((precio: any): number => Number(precio.precioLista)),
    );
    const precioObj = preciosProductoPrecio.find(
      (precio: any): boolean => Number(precio.precioLista) === precioMinPrecio,
    );

    if (precioObj) {
      precioLista = Number(precioObj.precioLista);
      precioTransfer = precioObj.precioTransfer ? Number(precioObj.precioTransfer) : null;
      precioSinImp = precioObj.precioSinImp ? Number(precioObj.precioSinImp) : null;
    }
  } else if (preciosCache.length > 0) {
    precioLista = Math.min(...preciosCache);
    const derivados = calcularTodosLosPrecios(precioLista, CUOTAS_FINANCIADO_DEFAULT);
    precioTransfer = derivados.precioTransfer;
    precioSinImp = derivados.precioSinImp;
  }

  const precioPublico = buildPrecioPublico({
    precioLista,
    precioTransfer,
    precioSinImp,
  });

  const precioMin = preciosCache.length > 0 ? Math.min(...preciosCache) : precioLista;
  const precioMax = preciosCache.length > 0 ? Math.max(...preciosCache) : precioLista;

  let imagenPrincipal: string | null = null;
  const varianteConImagen = variantesActivas.find(
    (v: any) => v.imagenes && v.imagenes.length > 0,
  );
  if (varianteConImagen?.imagenes?.[0]?.imagenUrl) {
    imagenPrincipal = varianteConImagen.imagenes[0].imagenUrl;
  } else if (varianteConImagen?.imagenVariante) {
    imagenPrincipal = varianteConImagen.imagenVariante;
  } else if (p.imagenes && typeof p.imagenes === 'object') {
    const imagenesArray = Array.isArray(p.imagenes)
      ? p.imagenes
      : Object.values(p.imagenes);
    if (imagenesArray.length > 0 && typeof imagenesArray[0] === 'string') {
      imagenPrincipal = imagenesArray[0];
    }
  }
  if (!imagenPrincipal && padreImagenRows.length > 0) {
    imagenPrincipal = firstPadreImagenUrl(padreImagenRows);
  }

  const imagenesPorColor = new Map<string, string | null>();

  variantesActivas.forEach((v: any): void => {
    if (v.color && !imagenesPorColor.has(v.color)) {
      const varianteConImagenColor = variantesActivas.find(
        (v2: any): boolean =>
          v2.color === v.color && (v2.imagenes?.[0]?.imagenUrl || v2.imagenVariante),
      );

      let imagen =
        varianteConImagenColor?.imagenes?.[0]?.imagenUrl ||
        varianteConImagenColor?.imagenVariante ||
        null;

      if (!imagen) {
        imagen = padreImagenForColor(padreImagenRows, v.color);
      }

      imagenesPorColor.set(v.color, imagen);
    }
  });

  const variantes: VariantePublicada[] = variantesActivas.map((v: any): VariantePublicada => {
    const imagenColor = v.color
      ? imagenesPorColor.get(v.color) ||
        padreImagenForColor(padreImagenRows, v.color) ||
        imagenPrincipal
      : imagenPrincipal;

    return {
      id: v.id,
      codigo: v.sfactoryCodigo,
      color: v.color,
      talle: v.talle,
      stock: Number(v.stockCache || 0),
      precio: Number(v.precioCache || 0),
      imagen: imagenColor,
      tieneImagen: !!imagenColor,
      productoPadreId: p.id,
      sfactoryId: Number(v.sfactoryId),
    };
  });

  const colores = Array.from(
    new Set(
      variantesActivas
        .map((v: any): string | null => v.color)
        .filter((c: string | null): c is string => !!c),
    ),
  ).sort();

  const talles = Array.from(
    new Set(
      variantesActivas
        .map((v: any): string | null => v.talle)
        .filter((t: string | null): t is string => !!t),
    ),
  ).sort();

  const stockTotal = variantesActivas.reduce(
    (sum: number, v: any): number => sum + Number(v.stockCache || 0),
    0,
  );

  const sexos = variantesActivas
    .map((v: any): string | null => v.sexo)
    .filter((s: string | null): s is string => !!s);
  const sexoUnico: string | null =
    sexos.length > 0 && new Set(sexos).size === 1 ? (sexos[0] ?? null) : null;

  return {
    id: p.id,
    codigoAgrupacion: p.codigoAgrupacion,
    slug: p.slug,
    nombre: p.nombre,
    descripcion: p.descripcion,
    descripcionCorta: p.descripcionCorta,
    destacado: p.destacado,
    orden: p.orden,
    sexo: (p as any).genero ?? sexoUnico,
    rubro:
      p.rubro && p.rubro.slug
        ? {
            id: p.rubro.id,
            nombre: p.rubro.nombre,
            slug: p.rubro.slug,
          }
        : null,
    subrubro:
      p.subrubro && p.subrubro.slug
        ? {
            id: p.subrubro.id,
            nombre: p.subrubro.nombre,
            slug: p.subrubro.slug,
          }
        : null,
    imagenPrincipal,
    precioLista: precioPublico.precioLista,
    precioTransfer: precioPublico.precioTransfer,
    precioSinImp: precioPublico.precioSinImp,
    variantes,
    colores: colores as string[],
    talles: talles as string[],
    totalVariantes: variantesActivas.length,
    tieneStock: stockTotal > 0,
    stockTotal,
    precioMin,
    precioMax,
  };
}
