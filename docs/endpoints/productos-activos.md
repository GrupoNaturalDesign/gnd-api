# Endpoint: Productos Activos para Ecommerce

## Descripción
Endpoint público para obtener productos activos del ecommerce. Solo devuelve productos publicados con al menos una variante activa. Es la fuente de verdad para el cliente.

## Endpoint
```
GET /api/productos/activos
```

## Parámetros de Query

| Parámetro | Tipo | Requerido | Descripción | Valores |
|-----------|------|-----------|-------------|---------|
| `empresaId` | number | ✅ Sí | ID de la empresa | Número positivo |
| `destacado` | boolean | ❌ No | Filtrar por productos destacados | `true` o `false` |
| `rubroId` | number | ❌ No | Filtrar por rubro | Número positivo |
| `subrubroId` | number | ❌ No | Filtrar por subrubro | Número positivo |
| `search` | string | ❌ No | Búsqueda en nombre, descripción y código | 1-200 caracteres |
| `page` | number | ❌ No | Número de página | Mínimo: 1, Default: 1 |
| `limit` | number | ❌ No | Cantidad de resultados por página | 1-100, Default: 20 |
| `sortBy` | string | ❌ No | Campo para ordenar | `nombre`, `precio`, `destacado`, `orden` (default) |
| `sortOrder` | string | ❌ No | Orden ascendente o descendente | `asc` (default) o `desc` |

## Validaciones

1. **empresaId**: Requerido y debe ser un número positivo
2. **limit**: Debe estar entre 1 y 100
3. **page**: Debe ser mayor a 0
4. **search**: Máximo 200 caracteres

## Respuesta Exitosa

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "empresaId": 1,
      "codigoAgrupacion": "RE-001",
      "nombre": "Remera Básica",
      "descripcion": "Remera de algodón...",
      "descripcionCorta": "Remera básica",
      "descripcionMarketing": "Remera cómoda...",
      "publicado": true,
      "destacado": true,
      "orden": 1,
      "slug": "remera-basica",
      "imagenes": {...},
      "rubro": {
        "id": 1,
        "nombre": "Remeras",
        "slug": "remeras"
      },
      "subrubro": {
        "id": 1,
        "nombre": "Básicas",
        "slug": "basicas"
      },
      "productosWeb": [
        {
          "id": 1,
          "sfactoryCodigo": "RE-001-1",
          "nombre": "Remera Básica",
          "sexo": "Unisex",
          "talle": "M",
          "color": "Negro",
          "precioCache": 2500.00,
          "stockCache": 10,
          "imagenVariante": "https://..."
        }
      ],
      "_count": {
        "productosWeb": 3
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  },
  "message": "Productos activos obtenidos exitosamente"
}
```

## Características

- ✅ Solo productos publicados (`publicado: true`)
- ✅ Solo productos con al menos una variante activa (`activoSfactory: true`)
- ✅ Solo rubros y subrubros visibles en web (`visibleWeb: true`)
- ✅ Paginación completa
- ✅ Búsqueda en múltiples campos
- ✅ Filtros por destacado, rubro y subrubro
- ✅ Ordenamiento configurable
- ✅ Optimizado para ecommerce (solo datos necesarios)

## Ejemplos de Uso

### Obtener todos los productos activos
```
GET /api/productos/activos?empresaId=1
```

### Obtener productos destacados
```
GET /api/productos/activos?empresaId=1&destacado=true
```

### Buscar productos
```
GET /api/productos/activos?empresaId=1&search=remera
```

### Filtrar por rubro y paginar
```
GET /api/productos/activos?empresaId=1&rubroId=1&page=2&limit=10
```

### Ordenar por nombre descendente
```
GET /api/productos/activos?empresaId=1&sortBy=nombre&sortOrder=desc
```

## Errores

### 400 Bad Request
```json
{
  "success": false,
  "error": "empresaId es requerido y debe ser un número positivo",
  "message": "El ID de empresa es obligatorio para obtener productos activos"
}
```

### 400 Bad Request - Límite inválido
```json
{
  "success": false,
  "error": "El límite debe estar entre 1 y 100",
  "message": "El parámetro limit debe ser un número entre 1 y 100"
}
```

## Notas

- Este endpoint es **público** y no requiere autenticación
- El `empresaId` debe enviarse en los query params
- Los productos se ordenan por defecto: destacados primero, luego por orden, luego por nombre
- Solo se devuelven variantes activas (`activoSfactory: true`)
- Solo se devuelven rubros y subrubros visibles en web


