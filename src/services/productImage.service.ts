import prisma from '../lib/prisma';
import { imageUploadService, UploadOptions } from './imageUpload.service';
import { parseProductDescription } from '../utils/skuParser.util';
import {
  colorsMatch,
  filterImagesByColorParam,
  groupImagesByColor,
  resolveCanonicalColorLabel,
  SIN_COLOR_KEY,
  uniqueVariantColors,
} from '../utils/product-color.util';
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

type ProductoWebConPadre = {
  id: number;
  color: string | null;
  descripcionCompleta: string | null;
  nombre: string;
  productoPadreId: number;
  productoPadre: { nombre: string };
};

export class ProductImageService {
  private mapImage(img: {
    id: number;
    productoWebId: number;
    color: string | null;
    imagenUrl: string;
    orden: number;
    createdAt: Date;
    updatedAt: Date;
  }): ProductImage {
    return {
      id: img.id,
      productoWebId: img.productoWebId,
      color: img.color,
      imagenUrl: img.imagenUrl,
      orden: img.orden,
      createdAt: img.createdAt,
      updatedAt: img.updatedAt,
    };
  }

  private async getVariantColorsForPadre(productoPadreId: number): Promise<string[]> {
    const variantes = await prisma.productoWeb.findMany({
      where: { productoPadreId, activoSfactory: true },
      select: { color: true },
    });
    return uniqueVariantColors(variantes.map((v) => v.color));
  }

  private async findVarianteByColor(
    productoPadreId: number,
    color: string
  ): Promise<ProductoWebConPadre | null> {
    const variantes = await prisma.productoWeb.findMany({
      where: { productoPadreId, activoSfactory: true },
      include: { productoPadre: true },
      orderBy: { id: 'asc' },
    });

    return variantes.find((v) => v.color && colorsMatch(v.color, color)) ?? null;
  }

  private resolvePersistedColor(
    inputColor: string | undefined | null,
    producto: ProductoWebConPadre,
    variantColors: string[]
  ): string | undefined {
    if (producto.color?.trim()) {
      return producto.color;
    }
    if (inputColor?.trim()) {
      return (
        resolveCanonicalColorLabel(inputColor, variantColors) ??
        inputColor.trim()
      );
    }
    return undefined;
  }

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
    let producto: ProductoWebConPadre;
    let nombreBase: string;
    let variantColors: string[] = [];

    if (productoPadreId && !productoWebId) {
      variantColors = await this.getVariantColorsForPadre(productoPadreId);

      if (color && color.trim().length > 0) {
        const variante = await this.findVarianteByColor(productoPadreId, color);
        if (!variante) {
          throw new Error(
            `No se encontró una variante con el color "${color}" para este producto`
          );
        }
        producto = variante;
      } else {
        const variante = await prisma.productoWeb.findFirst({
          where: { productoPadreId, activoSfactory: true },
          include: { productoPadre: true },
          orderBy: { id: 'asc' },
        });
        if (!variante) {
          throw new Error('No se encontró ninguna variante para este producto');
        }
        producto = variante;
      }

      productoWebId = producto.id;
      nombreBase = producto.productoPadre.nombre;
    } else if (productoWebId) {
      const found = await prisma.productoWeb.findUnique({
        where: { id: productoWebId },
        include: { productoPadre: true },
      });

      if (!found) {
        throw new Error('Producto no encontrado');
      }

      producto = found;
      variantColors = await this.getVariantColorsForPadre(found.productoPadreId);
      nombreBase = found.productoPadre.nombre;
    } else {
      throw new Error('Debe proporcionar productoWebId o productoPadreId + color');
    }

    if (!nombreBase || nombreBase.trim() === '') {
      const parsed = parseProductDescription(
        producto.descripcionCompleta || producto.nombre || ''
      );
      nombreBase = parsed.nombreBase;
    }

    if (!nombreBase || nombreBase.trim() === '') {
      throw new Error('No se pudo determinar el nombre base del producto');
    }

    const persistedColor = this.resolvePersistedColor(color, producto, variantColors);

    console.log('🖼️ [IMAGE SERVICE] Preparando subida de imágenes');
    console.log('🖼️ [IMAGE SERVICE] Producto:', {
      productoWebId,
      productoPadreId,
      nombreBase,
      colorInput: color,
      colorPersistido: persistedColor,
      cantidadArchivos: files.length,
    });

    const uploadOptions: UploadOptions = {
      productoId: productoWebId!,
      nombreBase,
      color: persistedColor,
      files,
    };

    console.log('🔄 [IMAGE SERVICE] Iniciando subida a FTP...');
    const uploadResults = await imageUploadService.uploadImages(uploadOptions);
    console.log(`✅ [IMAGE SERVICE] ${uploadResults.length} imagen(es) subida(s) a FTP`);

    console.log('💾 [IMAGE SERVICE] Guardando URLs en base de datos...');
    const images: ProductImage[] = [];

    for (let i = 0; i < uploadResults.length; i++) {
      const result = uploadResults[i];
      if (!result) {
        console.warn(`⚠️ [IMAGE SERVICE] Resultado ${i + 1} es undefined, saltando...`);
        continue;
      }

      const colorToSave = persistedColor ?? (result.color || null);

      const image = await prisma.productoImagen.create({
        data: {
          productoWebId: productoWebId!,
          color: colorToSave,
          imagenUrl: result.url,
          orden: result.orden,
        },
      });

      images.push(this.mapImage(image));
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
    const images = await prisma.productoImagen.findMany({
      where: { productoWebId },
      orderBy: [{ color: 'asc' }, { orden: 'asc' }],
    });

    const mapped = images.map((img) => this.mapImage(img));
    if (!color) return mapped;
    return filterImagesByColorParam(mapped, color);
  }

  /**
   * Obtiene imágenes agrupadas por color
   */
  async getProductImagesByColor(
    productoWebId: number
  ): Promise<Record<string, ProductImage[]>> {
    const producto = await prisma.productoWeb.findUnique({
      where: { id: productoWebId },
      select: { productoPadreId: true },
    });
    const variantColors = producto
      ? await this.getVariantColorsForPadre(producto.productoPadreId)
      : [];

    const images = await this.getProductImages(productoWebId);
    return groupImagesByColor(images, variantColors);
  }

  /**
   * Obtiene colores únicos de un producto (canónicos, sin duplicados por casing)
   */
  async getProductColors(productoWebId: number): Promise<string[]> {
    const grouped = await this.getProductImagesByColor(productoWebId);
    return Object.keys(grouped).filter((c) => c !== SIN_COLOR_KEY);
  }

  /**
   * Elimina una imagen
   */
  async deleteImage(imageId: number): Promise<void> {
    const image = await prisma.productoImagen.findUnique({
      where: { id: imageId },
    });

    if (!image) {
      throw new Error('Imagen no encontrada');
    }

    try {
      await imageUploadService.deleteImage(image.imagenUrl);
    } catch (error) {
      console.error('Error deleting image from FTP, continuing with DB deletion:', error);
    }

    await prisma.productoImagen.delete({
      where: { id: imageId },
    });
  }

  /**
   * Reordena imágenes actualizando el campo `orden` de cada una
   */
  async reorderImages(images: { id: number; orden: number }[]): Promise<void> {
    await prisma.$transaction(
      images.map(({ id, orden }) =>
        prisma.productoImagen.update({
          where: { id },
          data: { orden },
        })
      )
    );
  }

  /**
   * Imágenes de varios productos padre en una sola query (catálogo).
   */
  async getProductoPadreImagesBatch(
    productoPadreIds: number[],
  ): Promise<Map<number, ProductImage[]>> {
    if (productoPadreIds.length === 0) return new Map();

    const images = await prisma.productoImagen.findMany({
      where: {
        productoWeb: { productoPadreId: { in: productoPadreIds } },
      },
      orderBy: [{ orden: 'asc' }],
      include: {
        productoWeb: { select: { productoPadreId: true } },
      },
    });

    const map = new Map<number, ProductImage[]>();
    for (const img of images) {
      const padreId = img.productoWeb.productoPadreId;
      const list = map.get(padreId) ?? [];
      list.push(this.mapImage(img));
      map.set(padreId, list);
    }
    return map;
  }

  /**
   * Contexto para invalidar caché tras cambios en imágenes.
   */
  async resolveCacheInvalidation(params: {
    productoWebId?: number | null;
    productoPadreId?: number | null;
    imageId?: number | null;
  }): Promise<{ empresaId: number; productoPadreId: number } | null> {
    if (params.imageId) {
      const image = await prisma.productoImagen.findUnique({
        where: { id: params.imageId },
        include: {
          productoWeb: {
            select: { productoPadreId: true, empresaId: true },
          },
        },
      });
      if (!image?.productoWeb) return null;
      return {
        empresaId: image.productoWeb.empresaId,
        productoPadreId: image.productoWeb.productoPadreId,
      };
    }

    if (params.productoPadreId) {
      const padre = await prisma.productoPadre.findUnique({
        where: { id: params.productoPadreId },
        select: { id: true, empresaId: true },
      });
      if (!padre) return null;
      return { empresaId: padre.empresaId, productoPadreId: padre.id };
    }

    if (params.productoWebId) {
      const web = await prisma.productoWeb.findUnique({
        where: { id: params.productoWebId },
        select: { productoPadreId: true, empresaId: true },
      });
      if (!web) return null;
      return {
        empresaId: web.empresaId,
        productoPadreId: web.productoPadreId,
      };
    }

    return null;
  }

  /**
   * Obtiene imágenes de un producto padre (todas las variantes)
   */
  async getProductoPadreImages(
    productoPadreId: number,
    color?: string
  ): Promise<ProductImage[]> {
    const images = await prisma.productoImagen.findMany({
      where: {
        productoWeb: { productoPadreId },
      },
      orderBy: [{ color: 'asc' }, { orden: 'asc' }],
    });

    const mapped = images.map((img) => this.mapImage(img));
    if (!color) return mapped;
    return filterImagesByColorParam(mapped, color);
  }

  /**
   * Imágenes de producto padre agrupadas por color canónico
   */
  async getProductoPadreImagesByColor(
    productoPadreId: number,
    color?: string
  ): Promise<Record<string, ProductImage[]>> {
    const variantColors = await this.getVariantColorsForPadre(productoPadreId);
    const images = await this.getProductoPadreImages(productoPadreId, color);
    return groupImagesByColor(images, variantColors);
  }
}

export const productImageService = new ProductImageService();
