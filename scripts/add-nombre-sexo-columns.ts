import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
  try {
    console.log('Ejecutando script SQL para agregar columnas nombre y sexo...');
    
    const sqlFile = path.join(__dirname, '../prisma/add_nombre_sexo_to_productos_web.sql');
    const sql = fs.readFileSync(sqlFile, 'utf-8');
    
    // Dividir el SQL en statements individuales
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    for (const statement of statements) {
      if (statement.trim()) {
        console.log(`Ejecutando: ${statement.substring(0, 50)}...`);
        await prisma.$executeRawUnsafe(statement);
      }
    }
    
    console.log('✅ Columnas agregadas exitosamente!');
  } catch (error) {
    console.error('❌ Error al ejecutar el script:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();


