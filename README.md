# GND Backend API

Backend API para e-commerce de uniformes empresariales con sincronización S-Factory.

## 🚀 Tecnologías

- **Node.js** + **Express** + **TypeScript**
- **Prisma ORM** (MySQL)
- **Zod** para validación
- **Helmet** para seguridad
- **CORS** para cross-origin requests
- **Morgan** para logging

## 📋 Requisitos Previos

- Node.js >= 18
- MySQL >= 8.0
- npm o yarn

## 🔧 Instalación

1. **Instalar dependencias:**
```bash
npm install
```

2. **Configurar variables de entorno:**
Crea un archivo `.env` en la raíz del proyecto con:
```env
DATABASE_URL="mysql://usuario:password@localhost:3306/nombre_db"
PORT=3001
NODE_ENV=development

# S-Factory API Credentials
SFACTORY_API_URL=https://sfactory-api.com.ar/sfactory/api
SFACTORY_USERDEV=tu_email@ejemplo.com
SFACTORY_PASSWORD=tu_password
SFACTORY_USER_FACTORY=sfactory
SFACTORY_PASSWORD_FACTORY=tu_password_factory
SFACTORY_COMPANY_KEY=tu_company_key
```

3. **Generar cliente Prisma:**
```bash
npm run prisma:generate
```

4. **Ejecutar migraciones (si la DB ya existe):**
```bash
npm run prisma:push
```

O crear migraciones:
```bash
npm run prisma:migrate
```

## 🏃 Ejecutar

**Desarrollo:**
```bash
npm run dev
```

**Producción:**
```bash
npm run build
npm start
```

## 📚 Endpoints

### Health Check
- `GET /api/health` - Estado del servidor

### Rubros
- `GET /api/rubros` - Listar rubros
  - Query params: `empresaId` (requerido), `visibleWeb`, `search`, `includeSubrubros`
- `GET /api/rubros/:id` - Obtener rubro por ID
  - Query params: `includeSubrubros`
- `GET /api/rubros/slug/:slug` - Obtener rubro por slug
  - Query params: `empresaId` (requerido)

### Subrubros
- `GET /api/subrubros` - Listar subrubros
  - Query params: `empresaId` (requerido), `rubroId`, `visibleWeb`, `search`, `includeProductos`
- `GET /api/subrubros/:id` - Obtener subrubro por ID
  - Query params: `includeProductos`
- `GET /api/subrubros/slug/:slug` - Obtener subrubro por slug
  - Query params: `empresaId` (requerido)

### Productos
- `GET /api/productos` - Listar productos padre
  - Query params: `empresaId` (requerido), `rubroId`, `subrubroId`, `publicado`, `destacado`, `search`, `includeVariantes`
- `GET /api/productos/:id` - Obtener producto padre por ID
  - Query params: `includeVariantes`
- `GET /api/productos/slug/:slug` - Obtener producto por slug
  - Query params: `empresaId` (requerido), `includeVariantes`
- `GET /api/productos/:id/variantes` - Obtener variantes de un producto

## 📁 Estructura del Proyecto

```
gnd-back/
├── src/
│   ├── controllers/     # Controladores de rutas
│   ├── services/        # Lógica de negocio
│   ├── routes/          # Definición de rutas
│   ├── types/           # Tipos TypeScript y schemas Zod
│   ├── lib/             # Utilidades (Prisma client, etc.)
│   ├── app.ts           # Configuración de Express
│   └── index.ts         # Entry point
├── prisma/
│   └── schema.prisma    # Schema de Prisma
├── .env                 # Variables de entorno (no commitear)
├── tsconfig.json        # Configuración TypeScript
└── package.json
```

## 🗄️ Base de Datos

El schema de Prisma incluye las siguientes tablas principales:

- **empresas** - Multi-tenant
- **usuarios** - Autenticación
- **rubros** - Categorías principales (cache S-Factory)
- **subrubros** - Subcategorías
- **productos_padre** - Agrupador de productos
- **productos_web** - Variantes individuales
- **clientes** - Cache de clientes S-Factory
- **pedidos** - Órdenes de compra
- **pedidos_items** - Items de pedidos
- Y más...

## 🔐 Autenticación S-Factory

Para autenticarse con la API de S-Factory, usar:

```typescript
POST https://sfactory-api.com.ar/sfactory/api/sign_in
Body: {
  "auth": {
    "userdev": "email@ejemplo.com",
    "password": "password"
  },
  "service": {
    "module": "Auth",
    "method": "sign_in"
  },
  "parameters": {
    "user_factory": "sfactory",
    "password_factory": "password_factory",
    "companyKey": "company_key"
  }
}
```

## 📝 Scripts Disponibles

- `npm run dev` - Ejecutar en modo desarrollo con nodemon
- `npm run build` - Compilar TypeScript
- `npm start` - Ejecutar versión compilada
- `npm run prisma:generate` - Generar cliente Prisma
- `npm run prisma:migrate` - Crear migraciones
- `npm run prisma:push` - Sincronizar schema sin migraciones
- `npm run prisma:studio` - Abrir Prisma Studio

## 🛠️ Desarrollo

El proyecto usa:
- **TypeScript** con configuración estricta
- **Zod** para validación de schemas
- **Prisma** como ORM
- **Express** con middlewares de seguridad

## 📄 Licencia

ISC

