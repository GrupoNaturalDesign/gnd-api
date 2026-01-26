import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { ftpService } from './ftp.service';
import { slugifyProductName, slugifyImageName } from '../utils/slugify.util';
import { parseProductDescription } from '../utils/skuParser.util';
import type { MulterFile } from '../types/multer.types';

export interface UploadResult {
  url: string;
  filename: string;
  color: string;
  orden: number;
}

export interface UploadOptions {
  productoId: number;
  nombreBase: string;
  color?: string;
  files: MulterFile[];
}

/**
 * Configuración de multer para almacenamiento temporal
 */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'temp');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `upload-${uniqueSuffix}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de imagen (jpeg, jpg, png, webp)'));
    }
  },
});

/**
 * Calcula el siguiente número secuencial para una imagen
 */
async function getNextImageNumber(
  folderPath: string,
  baseFilename: string
): Promise<number> {
  try {
    const files = await ftpService.listFiles(folderPath);
    const pattern = new RegExp(`^${baseFilename}-(\\d+)\\.(jpg|jpeg|png|webp)$`, 'i');
    const numbers: number[] = [];

    for (const file of files) {
      const match = file.match(pattern);
      if (match && match[1]) {
        numbers.push(parseInt(match[1], 10));
      }
    }

    if (numbers.length === 0) return 1;
    return Math.max(...numbers) + 1;
  } catch (error) {
    console.error('Error getting next image number:', error);
    return 1;
  }
}

/**
 * Limpia archivos temporales
 */
function cleanupTempFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error(`Error cleaning up temp file ${filePath}:`, error);
  }
}

/**
 * Sube imágenes a FTP y retorna las URLs públicas
 */
export class ImageUploadService {
  /**
   * Sube múltiples imágenes para un producto
   */
  async uploadImages(options: UploadOptions): Promise<UploadResult[]> {
    const { productoId, nombreBase, color, files } = options;

    console.log('📁 [FTP UPLOAD] Iniciando proceso de subida');
    console.log('📁 [FTP UPLOAD] Opciones:', {
      productoId,
      nombreBase,
      color,
      cantidadArchivos: files.length,
    });

    if (!files || files.length === 0) {
      console.error('❌ [FTP UPLOAD] No se proporcionaron archivos');
      throw new Error('No se proporcionaron archivos');
    }

    // Crear estructura de carpetas
    const folderName = slugifyProductName(nombreBase);
    const baseFilename = slugifyImageName(nombreBase, color || '');
    const folderPath = folderName;

    console.log('📂 [FTP UPLOAD] Estructura de carpetas:', {
      folderName,
      baseFilename,
      folderPath,
    });

    try {
      // Conectar a FTP
      console.log('🔌 [FTP UPLOAD] Conectando al servidor FTP...');
      await ftpService.connect();
      console.log('✅ [FTP UPLOAD] Conexión FTP establecida');

      // Asegurar que el directorio existe
      console.log(`📁 [FTP UPLOAD] Asegurando que existe el directorio: ${folderPath}`);
      await ftpService.ensureDirectory(folderPath);
      console.log(`✅ [FTP UPLOAD] Directorio verificado/creado: ${folderPath}`);

      const results: UploadResult[] = [];
      const uploadedFiles: string[] = [];

      try {
        // Subir cada archivo
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          if (!file) {
            console.warn(`⚠️ [FTP UPLOAD] Archivo ${i + 1} es undefined, saltando...`);
            continue;
          }
          const tempPath = file.path;

          console.log(`📤 [FTP UPLOAD] Procesando archivo ${i + 1}/${files.length}:`, {
            originalname: file.originalname,
            tempPath,
            size: `${(file.size / 1024).toFixed(2)} KB`,
          });

          // Obtener número secuencial
          const imageNumber = await getNextImageNumber(folderPath, baseFilename);
          console.log(`🔢 [FTP UPLOAD] Número secuencial obtenido: ${imageNumber}`);

          // Determinar extensión
          const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
          const filename = `${baseFilename}-${imageNumber}${ext}`;
          const remotePath = `${folderPath}/${filename}`;

          console.log(`📝 [FTP UPLOAD] Nombre de archivo generado: ${filename}`);
          console.log(`📝 [FTP UPLOAD] Ruta remota: ${remotePath}`);

          // Subir archivo
          console.log(`⬆️ [FTP UPLOAD] Subiendo archivo a FTP...`);
          await ftpService.uploadFile(tempPath, remotePath);
          uploadedFiles.push(tempPath);
          console.log(`✅ [FTP UPLOAD] Archivo subido exitosamente: ${filename}`);

          // Guardamos SOLO el path relativo
          const imagePath = `products/${remotePath}`;

          results.push({
            url: imagePath,
            filename,
            color: color || '',
            orden: imageNumber,
          });

        }

        console.log(`✅ [FTP UPLOAD] Proceso completado. ${results.length} archivo(s) subido(s)`);
        return results;
      } catch (error) {
        // Si hay error, intentar limpiar archivos subidos
        console.error('❌ [FTP UPLOAD] Error durante la subida, limpiando archivos:', error);
        for (const result of results) {
          try {
            const remotePath = `${folderPath}/${result.filename}`;
            console.log(`🧹 [FTP UPLOAD] Eliminando archivo remoto: ${remotePath}`);
            await ftpService.deleteFile(remotePath);
          } catch (cleanupError) {
            console.error('❌ [FTP UPLOAD] Error al limpiar archivo remoto:', cleanupError);
          }
        }
        throw error;
      } finally {
        // Limpiar archivos temporales
        console.log('🧹 [FTP UPLOAD] Limpiando archivos temporales...');
        for (const file of files) {
          cleanupTempFile(file.path);
        }
        console.log('🔌 [FTP UPLOAD] Desconectando del servidor FTP...');
        await ftpService.disconnect();
        console.log('✅ [FTP UPLOAD] Desconexión completada');
      }
    } catch (error) {
      // Limpiar archivos temporales en caso de error
      console.error('❌ [FTP UPLOAD] Error general, limpiando archivos temporales:', error);
      for (const file of files) {
        cleanupTempFile(file.path);
      }
      throw error;
    }
  }

  /**
   * Elimina una imagen del servidor FTP
   */
  async deleteImage(imageUrl: string): Promise<void> {
    try {
      await ftpService.connect();

      // Extraer ruta relativa desde la URL pública
      const publicUrl = ftpService.getPublicUrl('');
      const relativePath = imageUrl.replace(publicUrl, '').replace(/^\//, '');

      await ftpService.deleteFile(relativePath);
      await ftpService.disconnect();
    } catch (error) {
      console.error('Error deleting image:', error);
      throw new Error(`Failed to delete image: ${error}`);
    }
  }
}

export const imageUploadService = new ImageUploadService();

