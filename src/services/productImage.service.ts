import prisma from '../lib/prisma';
import { imageUploadService, UploadOptions } from './imageUpload.service';
import { parseProductDescription } from '../utils/skuParser.util';
import type { MulterFile } from '../types/multer.types';

export interface ProductImage {
  id: number;
  productoWebId: number;
  color: string | null;
  imagenUrl: string;
  orden: number;
  createdAt: Date;
  updatedAt: Date;
}

export class ProductImageService {
  /**
   * Sube imágenes para un producto
   * Puede recibir productoWebId (existente) o productoPadreId + color (nuevo)
   */
  async uploadImages(
    productoWebId: number | null,
    color: string | undefined | null,
    files: MulterFile[],
    productoPadreId?: number | null
  ): Promise<ProductImage[]> {
    let producto;
    let nombreBase: string;

    // Si se proporciona productoPadreId, obtener la primera variante de ese color
    // Si color está vacío o es null, obtener la primera variante sin importar el color
    if (productoPadreId && !productoWebId) {
      const whereClause: any = {
        productoPadreId,
        activoSfactory: true,
      };
      
      // Solo filtrar por color si se proporciona y no está vacío
      if (color && color.trim().length > 0) {
        whereClause.color = color;
      }

      producto = await prisma.productoWeb.findFirst({
        where: whereClause,
        include: {
          productoPadre: true,
        },
        orderBy: {
          id: 'asc',
        },
      });

      if (!producto) {
        if (color && color.trim().length > 0) {
          throw new Error(`No se encontró una variante con el color "${color}" para este producto`);
        } else {
          throw new Error('No se encontró ninguna variante para este producto');
        }
      }

      productoWebId = producto.id;
      nombreBase = producto.productoPadre.nombre;
    } else if (productoWebId) {
      // Flujo existente: obtener por productoWebId
      producto = await prisma.productoWeb.findUnique({
        where: { id: productoWebId },
        include: {
          productoPadre: true,
        },
      });

      if (!producto) {
        throw new Error('Producto no encontrado');
      }

      nombreBase = producto.productoPadre.nombre;
    } else {
      throw new Error('Debe proporcionar productoWebId o productoPadreId + color');
    }

    // Si no hay nombre en el padre, intentar parsear desde la descripción
    if (!nombreBase || nombreBase.trim() === '') {
      const parsed = parseProductDescription(
        producto.descripcionCompleta || producto.nombre || ''
      );
      nombreBase = parsed.nombreBase;
    }

    if (!nombreBase || nombreBase.trim() === '') {
      throw new Error('No se pudo determinar el nombre base del producto');
    }

    // Subir imágenes a FTP
    console.log('🖼️ [IMAGE SERVICE] Preparando subida de imágenes');
    console.log('🖼️ [IMAGE SERVICE] Producto:', {
      productoWebId,
      productoPadreId,
      nombreBase,
      color,
      cantidadArchivos: files.length,
    });

    const uploadOptions: UploadOptions = {
      productoId: productoWebId!,
      nombreBase,
      color: color && color.trim().length > 0 ? color : undefined, // Convertir cadena vacía a undefined (opcional)
      files,
    };

    console.log('🔄 [IMAGE SERVICE] Iniciando subida a FTP...');
    const uploadResults = await imageUploadService.uploadImages(uploadOptions);
    console.log(`✅ [IMAGE SERVICE] ${uploadResults.length} imagen(es) subida(s) a FTP`);

    // Guardar URLs en base de datos
    console.log('💾 [IMAGE SERVICE] Guardando URLs en base de datos...');
    const images: ProductImage[] = [];

    for (let i = 0; i < uploadResults.length; i++) {
      const result = uploadResults[i];
      if (!result) {
        console.warn(`⚠️ [IMAGE SERVICE] Resultado ${i + 1} es undefined, saltando...`);
        continue;
      }
      console.log(`💾 [IMAGE SERVICE] Guardando imagen ${i + 1}/${uploadResults.length}:`, {
        url: result.url,
        color: result.color,
        orden: result.orden,
      });

      const image = await prisma.productoImagen.create({
        data: {
          productoWebId: productoWebId!,
          color: result.color,
          imagenUrl: result.url,
          orden: result.orden,
        },
      });

      console.log(`✅ [IMAGE SERVICE] Imagen guardada en BD con ID: ${image.id}`);

      images.push({
        id: image.id,
        productoWebId: image.productoWebId,
        color: image.color,
        imagenUrl: image.imagenUrl,
        orden: image.orden,
        createdAt: image.createdAt,
        updatedAt: image.updatedAt,
      });
    }

    console.log(`✅ [IMAGE SERVICE] Proceso completado. ${images.length} imagen(es) guardada(s) en BD`);
    return images;
  }

  /**
   * Obtiene todas las imágenes de un producto
   */
  async getProductImages(
    productoWebId: number,
    color?: string
  ): Promise<ProductImage[]> {
    const where: any = {
      productoWebId,
    };

    if (color) {
      where.color = color;
    }

    const images = await prisma.productoImagen.findMany({
      where,
      orderBy: [
        { color: 'asc' },
        { orden: 'asc' },
      ],
    });

    return images.map((img: { id: number; productoWebId: number; color: string | null; imagenUrl: string; orden: number; createdAt: Date; updatedAt: Date }) => ({
      id: img.id,
      productoWebId: img.productoWebId,
      color: img.color,
      imagenUrl: img.imagenUrl,
      orden: img.orden,
      createdAt: img.createdAt,
      updatedAt: img.updatedAt,
    }));
  }

  /**
   * Obtiene imágenes agrupadas por color
   */
  async getProductImagesByColor(productoWebId: number): Promise<Record<string, ProductImage[]>> {
    const images = await this.getProductImages(productoWebId);
    const grouped: Record<string, ProductImage[]> = {};

    for (const image of images) {
      const colorKey = image.color || 'sin-color';
      if (!grouped[colorKey]) {
        grouped[colorKey] = [];
      }
      grouped[colorKey].push(image);
    }

    return grouped;
  }

  /**
   * Obtiene colores únicos de un producto
   */
  async getProductColors(productoWebId: number): Promise<string[]> {
    const images = await prisma.productoImagen.findMany({
      where: { productoWebId },
      select: { color: true },
      distinct: ['color'],
    });

    return images
      .map((img: { color: string | null }) => img.color)
      .filter((color: string | null): color is string => color !== null);
  }

  /**
   * Elimina una imagen
   */
  async deleteImage(imageId: number): Promise<void> {
    // Obtener información de la imagen
    const image = await prisma.productoImagen.findUnique({
      where: { id: imageId },
    });

    if (!image) {
      throw new Error('Imagen no encontrada');
    }

    // Eliminar del servidor FTP
    try {
      await imageUploadService.deleteImage(image.imagenUrl);
    } catch (error) {
      console.error('Error deleting image from FTP, continuing with DB deletion:', error);
    }

    // Eliminar de base de datos
    await prisma.productoImagen.delete({
      where: { id: imageId },
    });
  }

  /**
   * Obtiene imágenes de un producto padre (todas las variantes)
   */
  async getProductoPadreImages(
    productoPadreId: number,
    color?: string
  ): Promise<ProductImage[]> {
    const where: any = {
      productoWeb: {
        productoPadreId,
      },
    };

    if (color) {
      where.color = color;
    }

    const images = await prisma.productoImagen.findMany({
      where,
      include: {
        productoWeb: {
          select: {
            id: true,
            nombre: true,
            color: true,
            talle: true,
          },
        },
      },
      orderBy: [
        { color: 'asc' },
        { orden: 'asc' },
      ],
    });

    return images.map((img: { id: number; productoWebId: number; color: string | null; imagenUrl: string; orden: number; createdAt: Date; updatedAt: Date }) => ({
      id: img.id,
      productoWebId: img.productoWebId,
      color: img.color,
      imagenUrl: img.imagenUrl,
      orden: img.orden,
      createdAt: img.createdAt,
      updatedAt: img.updatedAt,
    }));
  }
}

export const productImageService = new ProductImageService();

