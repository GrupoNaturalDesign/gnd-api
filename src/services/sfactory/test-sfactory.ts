// test-sfactory.ts
import { sfactoryService } from './sfactory.service';

async function testSFactory() {
  try {
    console.log('🧪 Probando conexión a S-Factory...\n');

    // 1. Listar rubros
    console.log('📦 Obteniendo rubros...');
    const rubros = await sfactoryService.listarRubros();
    console.log(`✅ Rubros obtenidos: ${rubros.data?.length || 0}`);
    console.log('Primeros 3 rubros:', rubros.data?.slice(0, 3));

    console.log('\n---\n');

    // 2. Listar subrubros
    console.log('📦 Obteniendo subrubros...');
    const subrubros = await sfactoryService.listarSubrubros();
    console.log(`✅ Subrubros obtenidos: ${subrubros.data?.length || 0}`);
    console.log('Primeros 3 subrubros:', subrubros.data?.slice(0, 3));

    console.log('\n---\n');

    // 3. Listar items (limitado para prueba)
    console.log('📦 Obteniendo items...');
    const items = await sfactoryService.listarItems();
    console.log(`✅ Items obtenidos: ${items.data?.length || 0}`);
    console.log('Primeros 2 items:', items.data?.slice(0, 2));

    console.log('\n✅ ¡Todas las pruebas pasaron!');

  } catch (error: any) {
    console.error('❌ Error en pruebas:', error.message);
    process.exit(1);
  }
}

testSFactory();