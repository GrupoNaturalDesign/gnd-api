
import dotenv from 'dotenv';
import path from 'path';

// Carga el .env desde la raíz de api/
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { mercadoPagoConfig, mercadoPagoClient } from './index';

async function main() {
    console.log('Modo:', mercadoPagoConfig.getMode());
    console.log('Configurado:', mercadoPagoConfig.isConfigured());

    const pref = await mercadoPagoClient.createPreference({
        items: [{ title: 'Test producto', quantity: 1, unit_price: 100, currency_id: 'ARS' }],
        external_reference: 'test_001',
        back_urls: {
            success: 'https://example.com/ok',
            failure: 'https://example.com/error',
            pending: 'https://example.com/pendiente',
        },
        auto_return: 'approved',
    });

    console.log('✅ Preferencia creada:', pref.id);
    console.log('🔗 URL sandbox:', pref.sandbox_init_point);
}

main().catch(console.error);