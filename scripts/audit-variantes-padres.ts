/**
 * Auditoría de segmentación por producto padre (nombre + código agrupación).
 *
 * Uso:
 *   npx ts-node --transpile-only scripts/audit-variantes-padres.ts [empresaId]
 *   npx ts-node --transpile-only scripts/audit-variantes-padres.ts 1 --solo-problemas
 *   npx ts-node --transpile-only scripts/audit-variantes-padres.ts 1 --csv > audit.csv
 */
import prisma from '../src/lib/prisma';
import { parsearNombreProducto } from '../src/services/producto-agrupacion.service';
import {
  inferirColorDesdeSku,
  resolverColorVariante,
} from '../src/utils/sku-line-fusion.utils';
import { canonizarColor, canonizarTalle } from '../src/constants/variantes-filtros';
import { ECOMMERCE_RUBROS_SFACTORY_IDS } from '../src/config/ecommerce.config';

type JsonColores = string[] | null;

const STOPWORDS = new Set(
  [
    'de',
    'la',
    'el',
    'y',
    'en',
    'con',
    'para',
    'sin',
    'lavar',
    'producto',
    'prueba',
    'variante',
    'holaaa',
    'status',
    'sastrero',
    'executive',
    'strategy',
    'focus',
    'manage',
    'joyfull',
    'essence',
    'charm',
    'alma',
    'workfit',
    'wide',
    'leg',
    'rigido',
    'casual',
    'skinny',
    'flow',
    'sway',
    'cozy',
    'impacted',
    'pro',
    'reflect',
    'bolt',
    'cargo',
    'jean',
    'pantalon',
    'pantalón',
    'camisa',
    'chomba',
    'remera',
    'buzo',
    'sweater',
    'cardigan',
    'bermuda',
    'palazo',
    'delantal',
    'cofia',
    'campera',
    'casaca',
    'balance',
    'forge',
    'denim',
    'gabardina',
    'flavor',
    'chill',
    'tech',
    'standard',
    'gear',
    'brick',
    'ribet',
    'saw',
    'tool',
    'endure',
    'wrench',
    'executive',
    'ray',
    'combinada',
    'combinadas',
    'acero',
    'breathe',
    'base',
    'pro',
    '4xl',
    '3xs',
    '58',
    'oscuro',
  ].map((w) => w.toLowerCase())
);

function parseJsonStringArray(val: unknown): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter((x): x is string => typeof x === 'string');
  return [];
}

function codigoSospechosoDuplicado(codigo: string): boolean {
  return /_[HDU]_[HDU]$/i.test(codigo);
}

function tokensSospechosos(
  nombre: string,
  parseado: { color: string | null; talle: string | null; nombreBase: string }
): string[] {
  const palabrasNombre = nombre.split(/\s+/).filter(Boolean);
  const palabrasBase = new Set(
    parseado.nombreBase.split(/\s+/).filter(Boolean).map((p) => p.toLowerCase())
  );
  const genero = new Set([
    'hombre',
    'mujer',
    'dama',
    'damas',
    'masculino',
    'femenino',
    'unisex',
    'h',
    'm',
    'f',
  ]);

  const out: string[] = [];
  for (const p of palabrasNombre) {
    const lower = p.toLowerCase();
    if (genero.has(lower)) continue;
    if (STOPWORDS.has(lower)) continue;
    if (/^\d+$/.test(p)) continue;

    const colorCand = canonizarColor(p);
    const talleCand = canonizarTalle(p);

    if (colorCand && colorCand !== parseado.color) {
      out.push(`${p}→${colorCand}`);
      continue;
    }
    if (talleCand && talleCand !== parseado.talle) {
      out.push(`${p}→talle:${talleCand}`);
      continue;
    }

    if (!palabrasBase.has(lower) && p.length >= 2 && !colorCand && !talleCand) {
      out.push(p);
    }
  }
  return out;
}

function escCsv(val: string | number | null | undefined): string {
  const s = val == null ? '' : String(val);
  if (s.includes('"') || s.includes(',') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function main() {
  const empresaId = parseInt(process.argv[2] || '1', 10);
  const soloProblemas = process.argv.includes('--solo-problemas');
  const csv = process.argv.includes('--csv');

  const rubros = await prisma.rubro.findMany({
    where: { empresaId, sfactoryId: { in: ECOMMERCE_RUBROS_SFACTORY_IDS } },
    select: { id: true },
  });
  const rubroIds = rubros.map((r) => r.id);

  const padres = await prisma.productoPadre.findMany({
    where: {
      empresaId,
      ...(rubroIds.length > 0 && { rubroId: { in: rubroIds } }),
    },
    select: {
      id: true,
      codigoAgrupacion: true,
      nombre: true,
      genero: true,
      publicado: true,
      coloresDisponibles: true,
      tallesDisponibles: true,
    },
    orderBy: { nombre: 'asc' },
  });

  type Fila = {
    id: number;
    codigo: string;
    nombre: string;
    genero: string | null;
    publicado: boolean;
    parseColor: string | null;
    parseTalle: string | null;
    skuColor: string | null;
    coloresBd: string;
    tallesBd: string;
    variantes: number;
    sinColor: number;
    sinTalle: number;
    tokens: string;
    flags: string;
  };

  const filas: Fila[] = [];
  const tokenFreq = new Map<string, number>();

  for (const padre of padres) {
    const variantes = await prisma.productoWeb.findMany({
      where: { productoPadreId: padre.id, activoSfactory: true },
      select: { color: true, talle: true },
    });

    const total = variantes.length;
    const sinColor = variantes.filter((v) => !v.color).length;
    const sinTalle = variantes.filter((v) => !v.talle).length;
    const coloresBd = parseJsonStringArray(padre.coloresDisponibles);
    const tallesBd = parseJsonStringArray(padre.tallesDisponibles);

    const parseado = parsearNombreProducto(padre.nombre, padre.codigoAgrupacion);
    const parseColor = resolverColorVariante(
      parseado.color,
      null,
      padre.codigoAgrupacion
    );
    const skuColor = inferirColorDesdeSku(padre.codigoAgrupacion);
    const sospechosos = tokensSospechosos(padre.nombre, parseado);

    for (const t of sospechosos) {
      tokenFreq.set(t, (tokenFreq.get(t) ?? 0) + 1);
    }

    const flags: string[] = [];
    if (codigoSospechosoDuplicado(padre.codigoAgrupacion)) flags.push('CODIGO_DUPLICADO');
    if (sinColor > 0) flags.push('SIN_COLOR');
    if (sinTalle > 0) flags.push('SIN_TALLE');
    if (coloresBd.length === 0 && total > 0) flags.push('PADRE_SIN_COLORES');
    if (parseColor && !coloresBd.includes(parseColor)) flags.push('PARSE_COLOR_NO_EN_BD');
    if (skuColor && !coloresBd.includes(skuColor)) flags.push('SKU_COLOR_NO_EN_BD');
    if (sospechosos.length > 0) flags.push('TOKENS_NOMBRE');

    const fila: Fila = {
      id: padre.id,
      codigo: padre.codigoAgrupacion,
      nombre: padre.nombre,
      genero: padre.genero,
      publicado: padre.publicado,
      parseColor,
      parseTalle: parseado.talle,
      skuColor,
      coloresBd: coloresBd.join('|') || '-',
      tallesBd: tallesBd.length ? tallesBd.join('|') : '-',
      variantes: total,
      sinColor,
      sinTalle,
      tokens: sospechosos.join(' ') || '-',
      flags: flags.join(',') || 'OK',
    };

    if (soloProblemas && flags.length === 0) continue;
    filas.push(fila);
  }

  if (csv) {
    console.log(
      [
        'id',
        'codigo',
        'nombre',
        'genero',
        'publicado',
        'parse_color',
        'parse_talle',
        'sku_color',
        'colores_bd',
        'talles_bd',
        'variantes',
        'sin_color',
        'sin_talle',
        'tokens_sospechosos',
        'flags',
      ].join(',')
    );
    for (const f of filas) {
      console.log(
        [
          f.id,
          escCsv(f.codigo),
          escCsv(f.nombre),
          escCsv(f.genero),
          f.publicado ? 1 : 0,
          escCsv(f.parseColor),
          escCsv(f.parseTalle),
          escCsv(f.skuColor),
          escCsv(f.coloresBd),
          escCsv(f.tallesBd),
          f.variantes,
          f.sinColor,
          f.sinTalle,
          escCsv(f.tokens),
          escCsv(f.flags),
        ].join(',')
      );
    }
  } else {
    console.log(`\n=== Auditoría padres empresaId=${empresaId} ===`);
    console.log(`Total padres: ${padres.length}`);
    console.log(`Filas mostradas: ${filas.length}${soloProblemas ? ' (solo problemas)' : ''}\n`);

    for (const f of filas) {
      console.log(
        [
          `[${f.id}]`,
          f.flags,
          f.codigo,
          `| ${f.nombre}`,
          `| parse: color=${f.parseColor ?? '-'} talle=${f.parseTalle ?? '-'} sku=${f.skuColor ?? '-'}`,
          `| BD: [${f.coloresBd}] talles=${f.tallesBd}`,
          `| var=${f.variantes} sinColor=${f.sinColor} sinTalle=${f.sinTalle}`,
          f.tokens !== '-' ? `| tokens: ${f.tokens}` : '',
        ].join(' ')
      );
    }

    console.log('\n=== Tokens en nombre no resueltos (frecuencia) ===');
    const topTokens = [...tokenFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 40);
    for (const [token, count] of topTokens) {
      console.log(`  ${count}x  ${token}`);
    }

    const porFlag = {
      sinColor: filas.filter((f) => f.sinColor > 0).length,
      sinTalle: filas.filter((f) => f.sinTalle > 0).length,
      codigoDuplicado: filas.filter((f) => f.flags.includes('CODIGO_DUPLICADO')).length,
      tokensNombre: filas.filter((f) => f.flags.includes('TOKENS_NOMBRE')).length,
      padreSinColores: filas.filter((f) => f.flags.includes('PADRE_SIN_COLORES')).length,
    };
    console.log('\n=== Resumen ===');
    console.log(`  Padres con variantes sin color: ${porFlag.sinColor}`);
    console.log(`  Padres con variantes sin talle: ${porFlag.sinTalle}`);
    console.log(`  Padres con código _H/_D duplicado: ${porFlag.codigoDuplicado}`);
    console.log(`  Padres con tokens sospechosos en nombre: ${porFlag.tokensNombre}`);
    console.log(`  Padres sin coloresDisponibles: ${porFlag.padreSinColores}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
