import xlsx from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

// Configurar Prisma con el adapter de MariaDB (misma lógica que src/lib/prisma.ts)
function getPrismaClient(): PrismaClient {
  const dbUrl = process.env.DATABASE_URL;
  
  if (!dbUrl) {
    throw new Error(
      'DATABASE_URL is not defined. Please create a .env file with:\n' +
      'DATABASE_URL="mysql://user:password@localhost:3306/database_name"'
    );
  }

  try {
    const url = new URL(dbUrl);
    const dbConfig = {
      host: url.hostname,
      port: url.port ? parseInt(url.port, 10) : 3306,
      user: url.username,
      password: url.password,
      database: url.pathname.slice(1), // Remove leading '/'
      connectionLimit: parseInt(process.env.DB_POOL_LIMIT || '20', 10),
      acquireTimeout: parseInt(process.env.DB_ACQUIRE_TIMEOUT || '60000', 10),
      timeout: parseInt(process.env.DB_TIMEOUT || '30000', 10),
      reconnect: true,
      idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT || '300000', 10),
      multipleStatements: false,
      allowPublicKeyRetrieval: true,
    };

    const adapter = new PrismaMariaDb(dbConfig);
    
    return new PrismaClient({
      adapter,
      log: ['error', 'warn'],
    });
  } catch (error) {
    throw new Error(
      `Invalid DATABASE_URL format: ${dbUrl}. ` +
      `Expected format: mysql://user:password@host:port/database. ` +
      `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

const prisma = getPrismaClient();

// Interfaz para las filas del Excel
interface FilaExcel {
    codigo: string;
    stock: number;
}

function leerExcel(filePath: string): FilaExcel[] {
    if (!fs.existsSync(filePath)) {
        throw new Error(`El archivo no existe: ${filePath}`);
    }

    const workbook = xlsx.readFile(filePath);
    
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        throw new Error('El archivo Excel no tiene hojas de cálculo');
    }
    
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
        throw new Error('No se pudo obtener el nombre de la primera hoja');
    }
    
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
        throw new Error(`No se pudo leer la hoja "${sheetName}" del archivo Excel`);
    }
    
    // Leer sin headers (raw mode) - columna 0 = código, columna 5 = stock
    const data = xlsx.utils.sheet_to_json(sheet, { 
        header: 1,  // Usar arrays en lugar de objetos
        defval: null 
    }) as unknown[][];
    
    // Convertir a objetos con las columnas correctas
    const productos: FilaExcel[] = [];
    
    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length === 0) continue;
        
        const codigoRaw = row[0];
        const existenciaRaw = row[5];
        
        // Validar que el código sea válido
        if (!codigoRaw || codigoRaw === null || codigoRaw === undefined) {
            continue;
        }
        
        const codigoStr = String(codigoRaw).trim();
        
        // Filtrar filas que parecen ser encabezados, pies de página o números solos
        if (
            codigoStr === '' || 
            codigoStr.startsWith('Pag:') || 
            /^\d+$/.test(codigoStr) ||  // Solo números
            codigoStr.length < 3  // Códigos muy cortos probablemente no son válidos
        ) {
            continue;
        }
        
        // Validar que el código tenga el formato esperado (empieza con letra)
        if (!/^[A-Z]/.test(codigoStr)) {
            continue;
        }
        
        const stock = existenciaRaw !== null && existenciaRaw !== undefined 
            ? Number(existenciaRaw) || 0 
            : 0;
        
        productos.push({
            codigo: codigoStr,
            stock: stock
        });
    }
    
    // Validar que tenga datos
    if (productos.length === 0) {
        throw new Error('El archivo Excel está vacío o no tiene datos válidos');
    }
    
    return productos;
}

async function publicarProductosDesdeExcel(filePath: string, empresaId: number = 1) {
    const productosExcel = leerExcel(filePath);

    let actualizados = 0;
    let noEncontrados = 0;
    const codigosNoEncontrados: string[] = [];
    const errores: Array<{ codigo: string; error: string }> = [];

    for (const fila of productosExcel) {
        try {
            const codigo = fila.codigo.trim();
            const stock = fila.stock;

            // Buscar por sfactoryCodigo (comparación exacta)
            const productoWeb = await prisma.productoWeb.findFirst({
                where: {
                    empresaId,
                    sfactoryCodigo: codigo
                },
                include: {
                    productoPadre: true
                }
            });

            if (productoWeb) {
                const productoPadreId = productoWeb.productoPadreId;
                
                // 1. Actualizar el producto hijo encontrado
                await prisma.productoWeb.update({
                    where: { id: productoWeb.id },
                    data: {
                        activoSfactory: true,   // Publicado
                        stockCache: stock        // Stock real del Excel
                    }
                });
                
                // 2. Publicar el producto padre
                await prisma.productoPadre.update({
                    where: { id: productoPadreId },
                    data: {
                        publicado: true
                    }
                });
                
                // 3. Publicar todos los otros productos hijos del mismo padre
                await prisma.productoWeb.updateMany({
                    where: {
                        productoPadreId: productoPadreId,
                        empresaId: empresaId
                    },
                    data: {
                        activoSfactory: true
                    }
                });
                
                actualizados++;
            } else {
                noEncontrados++;
                codigosNoEncontrados.push(codigo);
            }
        } catch (error) {
            const codigo = fila.codigo || 'DESCONOCIDO';
            errores.push({ codigo, error: error instanceof Error ? error.message : 'Error desconocido' });
        }
    }

    // Resumen final
    console.log('\n' + '='.repeat(80));
    console.log('📊 RESUMEN DE SINCRONIZACIÓN');
    console.log('='.repeat(80));
    console.log(`✅ Productos actualizados: ${actualizados}`);
    console.log(`⚠️  Productos no encontrados: ${noEncontrados}`);
    console.log(`❌ Errores: ${errores.length}`);
    
    if (codigosNoEncontrados.length > 0) {
        console.log('\n📋 TODOS LOS CÓDIGOS NO ENCONTRADOS:');
        console.log('='.repeat(80));
        codigosNoEncontrados.forEach((codigo, index) => {
            console.log(`${index + 1}. ${codigo}`);
        });
        console.log('='.repeat(80));
    }
    
    if (errores.length > 0) {
        console.log('\n❌ Errores encontrados:');
        errores.forEach(({ codigo, error }) => {
            console.log(`   - ${codigo}: ${error}`);
        });
    }
    
    console.log('='.repeat(80));
}

async function main() {
    try {
        // Obtener el path del archivo desde argumentos de línea de comandos
        const filePathArg = process.argv[2];
        
        if (!filePathArg) {
            console.error('❌ Error: Debes proporcionar la ruta del archivo Excel');
            console.log('\nUso: ts-node scripts/syncCSVProducts.ts <ruta-al-archivo.xlsx> [empresaId]');
            console.log('\nEjemplo:');
            console.log('  ts-node scripts/syncCSVProducts.ts uploads/archivo.xlsx');
            console.log('  ts-node scripts/syncCSVProducts.ts uploads/archivo.xlsx 1');
            process.exit(1);
        }

        // Resolver el path (absoluto o relativo al directorio del proyecto)
        const filePath = path.isAbsolute(filePathArg) 
            ? filePathArg 
            : path.resolve(process.cwd(), filePathArg);

        // Obtener empresaId opcional (por defecto 1)
        const empresaId = process.argv[3] ? parseInt(process.argv[3], 10) : 1;
        
        if (isNaN(empresaId)) {
            console.error('❌ Error: empresaId debe ser un número válido');
            process.exit(1);
        }

        await publicarProductosDesdeExcel(filePath, empresaId);
    } catch (error) {
        console.error('❌ Error al ejecutar el script:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

// Ejecutar el script
main().catch((error) => {
    console.error('❌ Error fatal:', error);
    process.exit(1);
});