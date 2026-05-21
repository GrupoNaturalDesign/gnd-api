import prisma from '../lib/prisma';
import type { DatosBancariosBody } from '../validation/datos-bancarios.validation';

export interface DatosBancariosRecord {
  id: number;
  empresaId: number;
  banco: string;
  tipoCuenta: string;
  numeroCuenta: string;
  cbu: string | null;
  alias: string | null;
  titular: string;
  cuit: string | null;
  instrucciones: string | null;
  activo: boolean;
  updatedAt: Date;
}

export interface DatosBancariosPublic {
  banco: string;
  tipoCuenta: string;
  numeroCuenta: string;
  cbu: string | null;
  alias: string | null;
  titular: string;
  cuit: string | null;
  instrucciones: string | null;
}

function mapRow(row: {
  id: number;
  empresaId: number;
  banco: string;
  tipoCuenta: string;
  numeroCuenta: string;
  cbu: string | null;
  alias: string | null;
  titular: string;
  cuit: string | null;
  instrucciones: string | null;
  activo: boolean;
  updatedAt: Date;
}): DatosBancariosRecord {
  return {
    id: row.id,
    empresaId: row.empresaId,
    banco: row.banco,
    tipoCuenta: row.tipoCuenta,
    numeroCuenta: row.numeroCuenta,
    cbu: row.cbu,
    alias: row.alias,
    titular: row.titular,
    cuit: row.cuit,
    instrucciones: row.instrucciones,
    activo: row.activo,
    updatedAt: row.updatedAt,
  };
}

function isPublicReady(row: DatosBancariosRecord): boolean {
  if (!row.activo) return false;
  if (!row.banco.trim() || !row.titular.trim()) return false;
  return Boolean(row.cbu?.trim() || row.alias?.trim());
}

export const empresaDatosBancariosService = {
  async getDatosBancarios(empresaId: number): Promise<DatosBancariosRecord | null> {
    const row = await prisma.empresaDatosBancarios.findUnique({
      where: { empresaId },
    });
    return row ? mapRow(row) : null;
  },

  async getDatosBancariosPublic(empresaId: number): Promise<DatosBancariosPublic | null> {
    const row = await this.getDatosBancarios(empresaId);
    if (!row || !isPublicReady(row)) return null;
    return {
      banco: row.banco,
      tipoCuenta: row.tipoCuenta,
      numeroCuenta: row.numeroCuenta,
      cbu: row.cbu,
      alias: row.alias,
      titular: row.titular,
      cuit: row.cuit,
      instrucciones: row.instrucciones,
    };
  },

  async upsertDatosBancarios(
    empresaId: number,
    input: DatosBancariosBody
  ): Promise<DatosBancariosRecord> {
    const row = await prisma.empresaDatosBancarios.upsert({
      where: { empresaId },
      create: {
        empresaId,
        banco: input.banco,
        tipoCuenta: input.tipoCuenta,
        numeroCuenta: input.numeroCuenta,
        cbu: input.cbu,
        alias: input.alias,
        titular: input.titular,
        cuit: input.cuit,
        instrucciones: input.instrucciones,
        activo: input.activo,
      },
      update: {
        banco: input.banco,
        tipoCuenta: input.tipoCuenta,
        numeroCuenta: input.numeroCuenta,
        cbu: input.cbu,
        alias: input.alias,
        titular: input.titular,
        cuit: input.cuit,
        instrucciones: input.instrucciones,
        activo: input.activo,
      },
    });
    return mapRow(row);
  },
};
