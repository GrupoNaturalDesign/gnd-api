import { sfactoryService } from '../sfactory/sfactory.service';
import prisma from '../../lib/prisma';
import type { SFactoryRubro, SFactorySubrubro } from '../../types/sfactory.types';

function generarSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export class RubroSyncService {
  async syncRubros(empresaId: number = 1) {
    try {
      const response = await sfactoryService.listarRubros();
      
      let rubros: SFactoryRubro[] = [];
      
      if (Array.isArray(response)) {
        rubros = response;
      } else if (response && typeof response === 'object' && 'data' in response) {
        const dataValue = (response as any).data;
        if (Array.isArray(dataValue)) {
          rubros = dataValue;
        }
      }

      let exitosos = 0;
      let fallidos = 0;

      // 2. Guardar cada rubro en la BD
      for (const rubro of rubros) {
        try {
          await prisma.rubro.upsert({
            where: {
              unique_empresa_sfactory: {
                empresaId: empresaId,
                sfactoryId: rubro.id,
              },
            },
            update: {
              nombre: rubro.nombre,
              sfactoryCodigo: rubro.codigo,
              slug: generarSlug(rubro.nombre),
              ultimaSync: new Date(),
            },
            create: {
              empresaId: empresaId,
              sfactoryId: rubro.id,
              sfactoryCodigo: rubro.codigo,
              nombre: rubro.nombre,
              slug: generarSlug(rubro.nombre),
              visibleWeb: true,
              orden: 0,
              ultimaSync: new Date(),
            },
          });
          exitosos++;
        } catch (error: any) {
          fallidos++;
        }
      }

      return {
        procesados: rubros.length,
        exitosos,
        fallidos,
      };
    } catch (error: any) {
      throw error;
    }
  }

  async syncSubrubros(empresaId: number = 1) {
    try {
      const response = await sfactoryService.listarSubrubros();
      
      let subrubros: SFactorySubrubro[] = [];
      
      if (Array.isArray(response)) {
        subrubros = response;
      } else if (response && typeof response === 'object' && 'data' in response) {
        const dataValue = (response as any).data;
        if (Array.isArray(dataValue)) {
          subrubros = dataValue;
        }
      }

      let exitosos = 0;
      let fallidos = 0;

      // 2. Guardar cada subrubro en la BD
      for (const subrubro of subrubros) {
        try {
          // Buscar el rubro local correspondiente
          const rubroLocal = await prisma.rubro.findFirst({
            where: {
              empresaId: empresaId,
              sfactoryId: subrubro.rubro_id,
            },
          });

          if (!rubroLocal) {
            fallidos++;
            continue;
          }

          await prisma.subrubro.upsert({
            where: {
              unique_empresa_sfactory: {
                empresaId: empresaId,
                sfactoryId: subrubro.id,
              },
            },
            update: {
              nombre: subrubro.nombre,
              sfactoryCodigo: subrubro.codigo,
              slug: generarSlug(subrubro.nombre),
              ultimaSync: new Date(),
            },
            create: {
              empresaId: empresaId,
              rubroId: rubroLocal.id,
              sfactoryId: subrubro.id,
              sfactoryCodigo: subrubro.codigo,
              sfactoryRubroId: subrubro.rubro_id,
              nombre: subrubro.nombre,
              slug: generarSlug(subrubro.nombre),
              visibleWeb: true,
              orden: 0,
              ultimaSync: new Date(),
            },
          });
          exitosos++;
        } catch (error: any) {
          fallidos++;
        }
      }

      return {
        procesados: subrubros.length,
        exitosos,
        fallidos,
      };
    } catch (error: any) {
      throw error;
    }
  }
}

export const rubroSyncService = new RubroSyncService();
