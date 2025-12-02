const mysql = require('mysql2/promise');

const config = {
  host: 'c266.ferozo.com',
  user: 'c2660418_ndts',
  password: 'wimume05LO',
  database: 'c2660418_ndts',
  port: 3306
};

async function testConnection() {
  try {
    console.log('🔄 Intentando conectar a MySQL...');
    console.log('Host:', config.host);
    console.log('Usuario:', config.user);
    console.log('Base de datos:', config.database);
    
    const connection = await mysql.createConnection(config);
    console.log('✅ Conexión exitosa!');
    
    const [rows] = await connection.execute('SELECT 1 + 1 AS result');
    console.log('✅ Query test exitoso:', rows);
    
    const [tables] = await connection.execute('SHOW TABLES');
    console.log('✅ Tablas en la base de datos:', tables);
    
    await connection.end();
  } catch (error) {
    console.error('❌ Error de conexión:', error.message);
    console.error('Código de error:', error.code);
    
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.log('\n💡 Verifica usuario/contraseña');
    } else if (error.code === 'ENOTFOUND') {
      console.log('\n💡 El host no se puede encontrar.');
    } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      console.log('\n💡 No se puede conectar al servidor.');
      console.log('1. Habilita tu IP en "Remote MySQL" en cPanel');
      console.log('2. Tu IP actual es:');
      const https = require('https');
      https.get('https://api.ipify.org?format=json', (resp) => {
        let data = '';
        resp.on('data', (chunk) => { data += chunk; });
        resp.on('end', () => {
          console.log('   IP:', JSON.parse(data).ip);
        });
      });
    }
  }
}

testConnection();