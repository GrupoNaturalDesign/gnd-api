# Integración con SFactory - Documentación Completa

## 📋 Tabla de Contenidos

1. [Visión General](#visión-general)
2. [Arquitectura](#arquitectura)
3. [Componentes Principales](#componentes-principales)
4. [Flujo de Autenticación](#flujo-de-autenticación)
5. [Flujo de Sincronización](#flujo-de-sincronización)
6. [Endpoints Disponibles](#endpoints-disponibles)
7. [Configuración](#configuración)
8. [Estructura de Datos](#estructura-de-datos)
9. [Ejemplos de Uso](#ejemplos-de-uso)
10. [Troubleshooting](#troubleshooting)

---

## 🎯 Visión General

SFactory es un software ERP local que gestiona inventarios, productos, clientes y pedidos. Esta integración permite:

- **Sincronizar datos** desde SFactory hacia nuestra base de datos
- **Mantener datos actualizados** mediante sincronizaciones manuales o programadas
- **Renderizar datos** desde nuestra BD en React Admin (evitando dependencias directas con SFactory)

### Flujo General

```
SFactory (API Externa)
    ↓
[Cliente HTTP + Autenticación]
    ↓
[Servicios de Sincronización]
    ↓
Base de Datos Propia (MySQL/Prisma)
    ↓
React Admin → Renderiza desde nuestra BD
```

---

## 🏗️ Arquitectura

### Capas de la Aplicación

```
┌─────────────────────────────────────────────────────────┐
│                    React Admin                          │
│              (Interfaz de Usuario)                      │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│                   API REST (Express)                    │
│  - Controllers                                          │
│  - Middleware (empresaMiddleware)                       │
│  - Routes                                               │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│              Servicios de Sincronización                │
│  - rubro-sync.service.ts                                │
│  - producto-sync.service.ts                             │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│              Servicios SFactory                         │
│  - sfactory.service.ts (Métodos específicos)            │
│  - sfactory.client.ts (Cliente HTTP)                    │
│  - sfactory-auth.service.ts (Autenticación centralizada)│
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│              Base de Datos (MySQL/Prisma)               │
│  - Empresas                                             │
│  - Rubros, Subrubros                                    │
│  - ProductosPadre, ProductosWeb                         │
└─────────────────────────────────────────────────────────┘
```

---

## 🔧 Componentes Principales

### 1. `sfactory-auth.service.ts` - Autenticación Centralizada

**Responsabilidad**: Gestionar tokens de autenticación con SFactory.

**Métodos principales**:
- `authenticateAndSave(companyKey)`: Autentica con SFactory y guarda el token en BD
- `getToken(companyKey?)`: Obtiene token válido (autentica si es necesario)
- `getEmpresaId(companyKey?)`: Obtiene el ID de empresa desde BD

**Características**:
- ✅ Tokens persistentes en BD (no se pierden al reiniciar)
- ✅ Renovación automática cuando expiran (30 días)
- ✅ Manejo de múltiples empresas mediante `companyKey`
- ✅ Single Source of Truth para autenticación

**Ubicación**: `api/src/services/sfactory/sfactory-auth.service.ts`

### 2. `sfactory.client.ts` - Cliente HTTP

**Responsabilidad**: Realizar peticiones HTTP a la API de SFactory.

**Métodos principales**:
- `request(module, method, parameters, companyKey?)`: Método genérico para cualquier petición

**Características**:
- ✅ Usa `sfactoryAuthService.getToken()` para obtener tokens (unificado)
- ✅ Maneja endpoints (`/sign_in` para auth, `/main` para datos)
- ✅ Construye el body según especificación de SFactory
- ✅ Manejo de errores y respuestas

**Ubicación**: `api/src/services/sfactory/sfactory.client.ts`

### 3. `sfactory.service.ts` - Métodos Específicos

**Responsabilidad**: Abstraer métodos específicos de la API de SFactory.

**Métodos disponibles**:
- `listarRubros()`: Obtiene todos los rubros
- `listarSubrubros()`: Obtiene todos los subrubros
- `listarItems()`: Obtiene todos los productos/items
- `buscarItems(criterios)`: Busca productos con criterios
- `crearCliente(data)`: Crea un cliente en SFactory
- `crearOrdenPedido(data, items)`: Crea una orden de pedido

**Ubicación**: `api/src/services/sfactory/sfactory.service.ts`

### 4. Servicios de Sincronización

#### `rubro-sync.service.ts`
- Sincroniza rubros y subrubros
- Hace `upsert` en BD (crea o actualiza)
- Genera slugs automáticamente

#### `producto-sync.service.ts`
- Sincroniza productos desde SFactory
- Agrupa productos por SKU (nombre normalizado + sexo)
- Crea `ProductoPadre` (agrupación) y `ProductoWeb` (variantes)
- Normaliza datos (color, talle, sexo)

**Ubicación**: `api/src/services/sync/`

### 5. Controllers

#### `sync.controller.ts`
- Endpoints REST para sincronización
- Maneja respuestas y errores
- Usa `empresaMiddleware` para obtener `empresaId`

#### `sfactory-auth.controller.ts`
- `/init`: Inicializa sesión con SFactory
- `/status`: Obtiene estado de sesión

### 6. Middleware

#### `empresa.middleware.ts`
- Inyecta `empresaId` automáticamente en las requests
- Obtiene empresa desde BD usando `companyKey` de SFactory
- Se aplica en rutas de sincronización

**Ubicación**: `api/src/middleware/empresa.middleware.ts`

---

## 🔐 Flujo de Autenticación

### Paso a Paso

1. **Primera vez / Token expirado**:
   ```
   Cliente solicita datos
   ↓
   sfactoryClient.request()
   ↓
   sfactoryAuthService.getToken()
   ↓
   ¿Hay token válido en BD?
   ├─ NO → authenticateAndSave()
   │        ├─ Busca empresa por companyKey
   │        ├─ Hace POST a /sign_in
   │        ├─ Recibe token
   │        └─ Guarda token en BD (expira en 30 días)
   │
   └─ SÍ → Retorna token
   ```

2. **Token válido existe**:
   ```
   sfactoryAuthService.getToken()
   ↓
   Consulta BD → Token válido encontrado
   ↓
   Retorna token inmediatamente (sin autenticar)
   ```

### Características Clave

- ⚡ **Performance**: Si hay token válido, no se autentica
- 🔄 **Renovación automática**: Cuando expira, se renueva automáticamente
- 💾 **Persistencia**: Tokens en BD, sobreviven reinicios
- 🏢 **Multi-empresa**: Cada empresa tiene su propio token

### Estructura del Token en BD

```typescript
// Tabla: empresas
{
  sfactoryToken: string,          // Token JWT
  sfactoryTokenExpiry: DateTime,  // Fecha de expiración (30 días)
  sfactoryCompanyId: number,      // ID de empresa en SFactory
  sfactoryUserId: number,         // ID de usuario en SFactory
  sfactoryCompanyKey: string      // Key única de empresa
}
```

---

## 🔄 Flujo de Sincronización

### Flujo Completo de Sincronización de Productos

```
1. Usuario hace click en "Sincronizar" en React Admin
   ↓
2. POST /api/sync/productos
   ↓
3. empresaMiddleware
   - Obtiene companyKey desde .env o request
   - Busca empresa en BD
   - Inyecta empresaId en req.empresaId
   ↓
4. syncController.syncProductos()
   - Extrae empresaId del request
   - Llama a productoSyncService.syncProductos(empresaId)
   ↓
5. productoSyncService.syncProductos()
   - Llama a sfactoryService.listarItems()
   ↓
6. sfactoryService.listarItems()
   - Llama a sfactoryClient.request('items', 'items_list', {...})
   ↓
7. sfactoryClient.request()
   - Obtiene token desde sfactoryAuthService.getToken()
   - Construye body con auth, service, credential, parameters
   - Hace POST a /main
   - Retorna response.data
   ↓
8. productoSyncService procesa productos
   - Agrupa productos por SKU (nombre normalizado + sexo)
   - Para cada grupo:
     ├─ Crea/actualiza ProductoPadre
     └─ Crea/actualiza ProductoWeb (variantes)
   ↓
9. Retorna resultado
   {
     procesados: number,
     exitosos: number,
     fallidos: number,
     sinCodigo: number,
     gruposCreados: number,
     productosPadreCreados: number,
     productosWebCreados: number
   }
   ↓
10. React Admin muestra resultado
```

### Sincronización de Rubros

Similar al flujo anterior, pero más simple:
- No hay agrupación
- Solo `upsert` directo de rubros y subrubros

### Sincronización Completa (`/sync/all`)

Ejecuta en orden:
1. Rubros
2. Subrubros
3. Productos

**⚠️ Importante**: Subrubros depende de rubros (hay relación foreign key)

---

## 🌐 Endpoints Disponibles

### Autenticación

#### `POST /api/sfactory/auth/init`
Inicializa sesión con SFactory. El `companyKey` se toma **solo desde la variable de entorno** del servidor (`SFACTORY_COMPANY_KEY`); no se acepta en el body por seguridad.

**Body**: no requerido (se usa `SFACTORY_COMPANY_KEY` del backend).

**Respuesta exitosa**:
```json
{
  "success": true,
  "data": {
    "empresaId": 1,
    "companyId": 123,
    "message": "Sesión de SFactory inicializada correctamente"
  },
  "message": "Autenticación exitosa"
}
```

#### `GET /api/sfactory/auth/status`
Obtiene estado de la sesión actual.

**Respuesta exitosa**:
```json
{
  "success": true,
  "data": {
    "empresaId": 1,
    "message": "Sesión activa"
  }
}
```

### Sincronización

#### `POST /api/sync/rubros`
Sincroniza rubros desde SFactory.

**Respuesta exitosa**:
```json
{
  "success": true,
  "data": {
    "procesados": 10,
    "exitosos": 10,
    "fallidos": 0
  },
  "message": "Rubros sincronizados exitosamente"
}
```

#### `POST /api/sync/subrubros`
Sincroniza subrubros desde SFactory.

**Respuesta exitosa**:
```json
{
  "success": true,
  "data": {
    "procesados": 25,
    "exitosos": 25,
    "fallidos": 0
  },
  "message": "Subrubros sincronizados exitosamente"
}
```

#### `POST /api/sync/productos`
Sincroniza productos desde SFactory.

**Respuesta exitosa**:
```json
{
  "success": true,
  "data": {
    "procesados": 150,
    "exitosos": 145,
    "fallidos": 3,
    "sinCodigo": 2,
    "gruposCreados": 50,
    "productosPadreCreados": 50,
    "productosWebCreados": 145
  },
  "message": "Productos sincronizados exitosamente"
}
```

#### `POST /api/sync/all`
Sincroniza todo: rubros, subrubros y productos.

**Respuesta exitosa**:
```json
{
  "success": true,
  "data": {
    "rubros": { "procesados": 10, "exitosos": 10, "fallidos": 0 },
    "subrubros": { "procesados": 25, "exitosos": 25, "fallidos": 0 },
    "productos": { "procesados": 150, "exitosos": 145, "fallidos": 3, ... }
  },
  "message": "Sincronización completa exitosa"
}
```

**⚠️ Notas**:
- Todas las rutas de sincronización requieren `empresaMiddleware`, que inyecta `empresaId` automáticamente.
- Las rutas de SFactory auth y de sync tienen **rate limiting** (límite de solicitudes por ventana de tiempo) para evitar abuso.

---

## ⚙️ Configuración

### Variables de Entorno

Agregar en `.env`:

```env
# URL base de la API de SFactory
SFACTORY_API_URL=https://tu-sfactory-api.com/api

# Credenciales de autenticación
SFACTORY_USERDEV=tu_userdev
SFACTORY_PASSWORD=tu_password

# Credenciales de usuario Factory
SFACTORY_USER_FACTORY=tu_user_factory
SFACTORY_PASSWORD_FACTORY=tu_password_factory

# Company Key (solo en backend, no viaja en el cliente)
SFACTORY_COMPANY_KEY=tu_company_key

# Cifrado del token en BD (recomendado en producción). Base64 de 32 bytes.
# Generar con: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
SFACTORY_TOKEN_ENCRYPTION_KEY=
```

### Base de Datos

Asegurarse de que la tabla `empresas` tenga las columnas necesarias:

```sql
ALTER TABLE empresas
ADD COLUMN sfactory_company_key VARCHAR(255) NOT NULL,
ADD COLUMN sfactory_token TEXT,
ADD COLUMN sfactory_token_expiry TIMESTAMP,
ADD COLUMN sfactory_company_id INT,
ADD COLUMN sfactory_user_id INT;
```

O usar Prisma:
```bash
npx prisma db push
```

### Crear Empresa en BD

```sql
INSERT INTO empresas (codigo, nombre, razon_social, sfactory_company_key, activa)
VALUES ('001', 'Mi Empresa', 'Mi Empresa S.A.', 'mi-company-key', true);
```

---

## 📊 Estructura de Datos

### Mapeo SFactory → BD

| SFactory | Nuestra BD | Descripción |
|----------|-----------|-------------|
| `rubro` | `rubros` | Categorías principales |
| `subrubro` | `subrubros` | Subcategorías |
| `item` | `productos_web` | Productos individuales |
| - | `productos_padre` | Agrupación de variantes (creado por nosotros) |

### ProductoPadre vs ProductoWeb

**ProductoPadre**:
- Agrupación de variantes (mismo nombre, diferentes colores/talles)
- Ejemplo: "Remera Básica"

**ProductoWeb**:
- Variante individual (color + talle específico)
- Ejemplo: "Remera Básica - Rojo - M"

### Agrupación de Productos

Los productos se agrupan automáticamente por:
- Nombre normalizado (sin color, talle, sexo)
- Sexo (si aplica)

**Ejemplo**:
```
SFactory:
- "Remera Básica Rojo M Hombre"
- "Remera Básica Azul L Hombre"
- "Remera Básica Rojo S Mujer"

Resultado:
ProductoPadre 1: "Remera Básica" (Hombre)
  ├─ ProductoWeb: Rojo M
  └─ ProductoWeb: Azul L

ProductoPadre 2: "Remera Básica" (Mujer)
  └─ ProductoWeb: Rojo S
```

---

## 💡 Ejemplos de Uso

### Desde React Admin (Frontend)

```typescript
// Sincronizar productos
const syncProductos = async () => {
  try {
    const response = await fetch('/api/sync/productos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await response.json();
    console.log('Sincronización:', data);
  } catch (error) {
    console.error('Error:', error);
  }
};

// Sincronizar todo
const syncAll = async () => {
  const response = await fetch('/api/sync/all', {
    method: 'POST'
  });
  return response.json();
};
```

### Desde Backend (Node.js/TypeScript)

```typescript
import { sfactoryService } from './services/sfactory/sfactory.service';
import { productoSyncService } from './services/sync/producto-sync.service';

// Usar servicio directamente
const productos = await sfactoryService.listarItems();

// Sincronizar
const resultado = await productoSyncService.syncProductos(empresaId);
```

### Usar Cliente HTTP Directamente

```typescript
import { sfactoryClient } from './services/sfactory/sfactory.client';

// Petición personalizada
const data = await sfactoryClient.request(
  'ventas',
  'ventas_listar_pedidos',
  { fecha_desde: '2024-01-01' },
  'mi-company-key' // opcional
);
```

---

## 🐛 Troubleshooting

### Error: "Empresa no encontrada con companyKey"

**Causa**: No existe empresa en BD con ese `companyKey`.

**Solución**:
```sql
-- Verificar empresas existentes
SELECT id, nombre, sfactory_company_key FROM empresas WHERE activa = true;

-- Crear o actualizar empresa
UPDATE empresas 
SET sfactory_company_key = 'tu-company-key' 
WHERE id = 1;
```

### Error: "Las columnas de sesión SFactory no existen"

**Causa**: Falta migración de BD.

**Solución**:
```bash
# Opción 1: Usar Prisma
npx prisma db push

# Opción 2: Ejecutar SQL manualmente
# (ver sección Configuración)
```

### Error: "HTTP error! status: 401"

**Causa**: Token inválido o credenciales incorrectas.

**Solución**:
1. Verificar credenciales en `.env`
2. Inicializar sesión manualmente:
   ```bash
   curl -X POST http://localhost:3000/api/sfactory/auth/init \
     -H "Content-Type: application/json" \
     -d '{"companyKey": "tu-company-key"}'
   ```

### Error: "Error de autenticación: [mensaje]"

**Causa**: Credenciales incorrectas o `companyKey` inválido.

**Solución**:
- Verificar `SFACTORY_USERDEV`, `SFACTORY_PASSWORD`
- Verificar `SFACTORY_USER_FACTORY`, `SFACTORY_PASSWORD_FACTORY`
- Verificar `SFACTORY_COMPANY_KEY`
- Contactar con administrador de SFactory

### Productos no se agrupan correctamente

**Causa**: Problema en el parseo de nombres.

**Solución**:
- Revisar `producto-agrupacion.service.ts`
- Verificar reglas de parseo en BD (`reglas_parseo`)
- Revisar logs de sincronización

### Token expira frecuentemente

**Causa**: Token expira antes de 30 días (problema con SFactory).

**Solución**:
- Verificar `sfactoryTokenExpiry` en BD
- El sistema renueva automáticamente, pero puedes forzar:
  ```typescript
  await sfactoryAuthService.authenticateAndSave('company-key');
  ```

### Sincronización lenta

**Causa**: Muchos productos o problemas de red.

**Solución**:
- Implementar sincronización por lotes
- Usar `syncAll` solo cuando sea necesario
- Considerar sincronización programada (cron job)

---

## 📝 Notas Importantes

1. **Orden de Sincronización**: Siempre sincronizar rubros → subrubros → productos (hay dependencias de foreign keys).

2. **Tokens**: Los tokens duran 30 días y se renuevan automáticamente. No es necesario manejar esto manualmente.

3. **Multi-empresa**: El sistema soporta múltiples empresas. Cada una tiene su propio `companyKey` y token.

4. **Idempotencia**: Las sincronizaciones son idempotentes (puedes ejecutarlas múltiples veces sin problemas).

5. **Performance**: Si hay token válido en BD, no se autentica. Esto mejora el rendimiento.

6. **Offline**: Si SFactory está offline, las sincronizaciones fallarán. Los datos existentes en nuestra BD siguen disponibles.

---

## 🔗 Archivos Relacionados

```
api/src/
├── services/
│   ├── sfactory/
│   │   ├── sfactory-auth.service.ts    # Autenticación centralizada
│   │   ├── sfactory.client.ts          # Cliente HTTP
│   │   └── sfactory.service.ts         # Métodos específicos
│   └── sync/
│       ├── rubro-sync.service.ts       # Sincronización rubros
│       └── producto-sync.service.ts    # Sincronización productos
├── controllers/
│   ├── sync.controller.ts              # Controller de sincronización
│   └── sfactory-auth.controller.ts     # Controller de autenticación
├── middleware/
│   └── empresa.middleware.ts           # Middleware para empresaId
└── routes/
    ├── sync.routes.ts                  # Rutas de sincronización
    └── sfactory-auth.routes.ts         # Rutas de autenticación
```

---

## 📚 Referencias

- **Schema Prisma**: `api/prisma/schema.prisma`
- **Tipos TypeScript**: `api/src/types/sfactory.types.ts`
- **README Principal**: `api/README.md`

---

**Última actualización**: Enero 2024  
**Versión**: 1.0.0

