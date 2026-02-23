import { Request, Response, NextFunction } from 'express';
import { productImageService } from '../services/productImage.service';
import { handleZodError } from '../utils/validation';
import { z } from 'zod';
import type { MulterFile } from '../types/multer.types';

const UploadImagesSchema = z.object({
  productoWebId: z.coerce.number().int().positive().nullable().optional(),
  productoPadreId: z.coerce.number().int().positive().nullable().optional(),
  // Permitir cadena vacía cuando se usa productoPadreId, o string válido cuando se usa productoWebId
  color: z.union([
    z.string().min(1).max(100), // String válido (cuando hay color)
    z.literal(''), // Cadena vacía (cuando no hay colores disponibles)
  ]).optional(),
});

const GetImagesSchema = z.object({
  productoWebId: z.coerce.number().int().positive(),
  color: z.string().optional(),
});

const DeleteImageSchema = z.object({
  imageId: z.coerce.number().int().positive(),
});

const ReorderImagesSchema = z.object({
  images: z
    .array(
      z.object({
        id: z.number().int().positive(),
        orden: z.number().int().min(1),
      })
    )
    .min(1),
});

export class ProductImagesController {
  /**
   * POST /api/product-images/upload
   * Sube imágenes para un producto
   */
  async uploadImages(req: Request, res: Response, next: NextFunction) {
    const startTime = Date.now();
    console.log('📤 [UPLOAD] Iniciando proceso de subida de imágenes');
    console.log('📤 [UPLOAD] Body recibido:', {
      productoWebId: req.body.productoWebId,
      productoPadreId: req.body.productoPadreId,
      color: req.body.color,
    });
    console.log('📤 [UPLOAD] Archivos recibidos:', (req.files as MulterFile[])?.length || 0);

    try {
      // Validar body
      const body = UploadImagesSchema.parse(req.body);
      console.log('✅ [UPLOAD] Validación de body exitosa');

      // Validar que hay archivos
      const files = (req.files as MulterFile[]) || [];
      console.log('📁 [UPLOAD] Archivos procesados:', files.length);
      
      if (files.length === 0) {
        console.error('❌ [UPLOAD] No se proporcionaron archivos');
        return res.status(400).json({
          success: false,
          error: 'No se proporcionaron archivos',
          message: 'Debe subir al menos una imagen',
        });
      }

      // Log de cada archivo
      files.forEach((file, index) => {
        console.log(`📄 [UPLOAD] Archivo ${index + 1}:`, {
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: `${(file.size / 1024).toFixed(2)} KB`,
          path: file.path,
        });
      });

      // Validar que se proporcione productoWebId o productoPadreId
      if (!body.productoWebId && !body.productoPadreId) {
        console.error('❌ [UPLOAD] Falta productoWebId o productoPadreId');
        return res.status(400).json({
          success: false,
          error: 'Debe proporcionar productoWebId o productoPadreId',
          message: 'Se requiere productoWebId o productoPadreId para subir imágenes',
        });
      }

      console.log('🔄 [UPLOAD] Iniciando subida al servicio...');
      // Subir imágenes
      // Convertir cadena vacía a undefined para que el backend lo maneje como 'sin-color'
      const colorValue = body.color && body.color.trim().length > 0 ? body.color : undefined;
      const images = await productImageService.uploadImages(
        body.productoWebId || null,
        colorValue,
        files,
        body.productoPadreId || null
      );

      const duration = Date.now() - startTime;
      console.log(`✅ [UPLOAD] Subida completada exitosamente en ${duration}ms`);
      console.log(`✅ [UPLOAD] Imágenes subidas: ${images.length}`);
      images.forEach((img, index) => {
        console.log(`  📷 Imagen ${index + 1}:`, {
          id: img.id,
          url: img.imagenUrl,
          color: img.color,
          orden: img.orden,
        });
      });

      res.json({
        success: true,
        data: images,
        message: `${images.length} imagen(es) subida(s) exitosamente`,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ [UPLOAD] Error después de ${duration}ms:`, error);
      
      const zodError = handleZodError(error);
      if (zodError) {
        console.error('❌ [UPLOAD] Error de validación:', zodError);
        return res.status(400).json({
          success: false,
          ...zodError,
        });
      }
      next(error);
    }
  }

  /**
   * GET /api/product-images/:productoWebId
   * Obtiene imágenes de un producto
   */
  async getImages(req: Request, res: Response, next: NextFunction) {
    try {
      const params = GetImagesSchema.parse({
        productoWebId: req.params.productoWebId,
        color: req.query.color as string | undefined,
      });

      const images = await productImageService.getProductImages(
        params.productoWebId,
        params.color
      );

      res.json({
        success: true,
        data: images,
        message: 'Imágenes obtenidas exitosamente',
      });
    } catch (error) {
      const zodError = handleZodError(error);
      if (zodError) {
        return res.status(400).json({
          success: false,
          ...zodError,
        });
      }
      next(error);
    }
  }

  /**
   * GET /api/product-images/:productoWebId/colors
   * Obtiene colores únicos de un producto
   */
  async getColors(req: Request, res: Response, next: NextFunction) {
    try {
      const productoWebId = z.coerce
        .number()
        .int()
        .positive()
        .parse(req.params.productoWebId);

      const colors = await productImageService.getProductColors(productoWebId);

      res.json({
        success: true,
        data: colors,
        message: 'Colores obtenidos exitosamente',
      });
    } catch (error) {
      const zodError = handleZodError(error);
      if (zodError) {
        return res.status(400).json({
          success: false,
          ...zodError,
        });
      }
      next(error);
    }
  }

  /**
   * GET /api/product-images/:productoWebId/by-color
   * Obtiene imágenes agrupadas por color
   */
  async getImagesByColor(req: Request, res: Response, next: NextFunction) {
    try {
      const productoWebId = z.coerce
        .number()
        .int()
        .positive()
        .parse(req.params.productoWebId);

      const grouped = await productImageService.getProductImagesByColor(
        productoWebId
      );

      res.json({
        success: true,
        data: grouped,
        message: 'Imágenes agrupadas por color obtenidas exitosamente',
      });
    } catch (error) {
      const zodError = handleZodError(error);
      if (zodError) {
        return res.status(400).json({
          success: false,
          ...zodError,
        });
      }
      next(error);
    }
  }

  /**
   * DELETE /api/product-images/:imageId
   * Elimina una imagen
   */
  async deleteImage(req: Request, res: Response, next: NextFunction) {
    try {
      const params = DeleteImageSchema.parse({
        imageId: req.params.imageId,
      });

      await productImageService.deleteImage(params.imageId);

      res.json({
        success: true,
        message: 'Imagen eliminada exitosamente',
      });
    } catch (error) {
      const zodError = handleZodError(error);
      if (zodError) {
        return res.status(400).json({
          success: false,
          ...zodError,
        });
      }

      if ((error as Error).message === 'Imagen no encontrada') {
        return res.status(404).json({
          success: false,
          message: 'Imagen no encontrada',
        });
      }

      next(error);
    }
  }

  /**
   * PATCH /api/product-images/reorder
   * Actualiza el orden de un conjunto de imágenes
   */
  async reorderImages(req: Request, res: Response, next: NextFunction) {
    try {
      const body = ReorderImagesSchema.parse(req.body);
      await productImageService.reorderImages(body.images);
      res.json({
        success: true,
        message: 'Orden actualizado exitosamente',
      });
    } catch (error) {
      const zodError = handleZodError(error);
      if (zodError) {
        return res.status(400).json({ success: false, ...zodError });
      }
      next(error);
    }
  }

  /**
   * GET /api/product-images/producto-padre/:productoPadreId
   * Obtiene imágenes de un producto padre (todas las variantes), agrupadas por color
   */
  async getProductoPadreImages(req: Request, res: Response, next: NextFunction) {
    console.log('📥 [GET IMAGES] Obteniendo imágenes de producto padre');
    try {
      const productoPadreId = z.coerce
        .number()
        .int()
        .positive()
        .parse(req.params.productoPadreId);

      const color = req.query.color as string | undefined;

      console.log('📥 [GET IMAGES] Parámetros:', {
        productoPadreId,
        color: color || 'todos',
      });

      const images = await productImageService.getProductoPadreImages(
        productoPadreId,
        color
      );

      console.log(`📥 [GET IMAGES] ${images.length} imagen(es) encontrada(s)`);

      // Agrupar por color
      const grouped: Record<string, typeof images> = {};
      images.forEach((img) => {
        const colorKey = img.color || 'sin-color';
        if (!grouped[colorKey]) {
          grouped[colorKey] = [];
        }
        grouped[colorKey].push(img);
      });

      console.log('📥 [GET IMAGES] Imágenes agrupadas por color:', {
        colores: Object.keys(grouped),
        totalPorColor: Object.entries(grouped).map(([color, imgs]) => ({
          color,
          cantidad: imgs.length,
        })),
      });

      res.json({
        success: true,
        data: grouped,
        message: 'Imágenes del producto padre obtenidas exitosamente',
      });
    } catch (error) {
      console.error('❌ [GET IMAGES] Error:', error);
      const zodError = handleZodError(error);
      if (zodError) {
        return res.status(400).json({
          success: false,
          ...zodError,
        });
      }
      next(error);
    }
  }
}

export const productImagesController = new ProductImagesController();

