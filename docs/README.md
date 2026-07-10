# Documentación API — GND

Índice de referencias operativas y de integraciones.

| Documento | Contenido |
|-----------|-----------|
| [checkout-pedido-lifecycle.md](./checkout-pedido-lifecycle.md) | Checkout unificado: stock web, SF post-pago, precios lista/transfer |
| [checkout-qa-operativo.md](./checkout-qa-operativo.md) | Checklist QA operativo por caso de prueba |
| [integrations-env.md](./integrations-env.md) | Modo unificado test/prod (`INTEGRATIONS_ENV`) — MP, MiCorreo, Andreani |
| [micorreo-health.md](./micorreo-health.md) | MiCorreo en capas: integrador vs cuenta portal, health, errores checkout |
| [installment-providers.md](./installment-providers.md) | *(Deprecado)* Cotización modular de cuotas — referencia histórica |
| [maintenance.md](./maintenance.md) | Modo mantenimiento (`MAINTENANCE_MODE` en API y `client/.env.local`) |
| [meta-pixel.md](./meta-pixel.md) | Meta Pixel en tienda (`client/`) — eventos, env y flujos MP vs manual |
| [sync-optimization.md](./sync-optimization.md) | Sync S-Factory optimizado (productos, stock, pedidos, clientes) |
| [shipping-module.md](./shipping-module.md) | Módulo de envíos, proveedores, rutas HTTP |
| [hostinger-deploy.md](./hostinger-deploy.md) | Deploy prod en Hostinger (`api.naturalonline.com.ar`), release, runbook, MP webhook |

El código en `api/src` prevalece sobre estos resúmenes.
