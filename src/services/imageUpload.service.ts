import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import sharp from 'sharp';
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
 * Detecta si estamos en un entorno serverless (Vercel, etc.)
 * donde el sistema de archivos es de solo lectura
 */
function isServerlessEnvironment(): boolean {
  // Vercel proporciona estas variables de entorno automáticamente
  return !!(
    process.env.VERCEL || 
    process.env.VERCEL_ENV || 
    process.env.NODE_ENV === 'production' ||
    process.env.AWS_LAMBDA_FUNCTION_NAME || // Para AWS Lambda
    process.env.AZURE_FUNCTIONS_ENVIRONMENT // Para Azure Functions
  );
}

/**
 * Configuración de multer para almacenamiento
 * En entornos serverless (Vercel) usa memoria, en desarrollo usa disco
 */
const storage = isServerlessEnvironment()
  ? multer.memoryStorage() // Serverless: memoria (sistema de archivos read-only)
  : multer.diskStorage({  // Desarrollo: disco
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
    const ext = path.extname(file.originalname).toLowerCase().replace(/^\./, '');
    const extOk = allowedTypes.test(ext);
    const mimetypeOk = allowedTypes.test(file.mimetype || '');
    const genericMimetype = !file.mimetype || file.mimetype === 'application/octet-stream';

    if (extOk && (mimetypeOk || genericMimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de imagen (jpeg, jpg, png, webp)'));
    }
  },
});

/** Multer para documentos: acepta imágenes + PDF, hasta 10MB */
export const uploadDocument = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedExt = /jpeg|jpg|png|webp|pdf/;
    const extname = allowedExt.test(path.extname(file.originalname).toLowerCase());
    const mimetype =
      allowedExt.test(file.mimetype) || file.mimetype === 'application/pdf';

    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes (JPG, PNG, WEBP) o PDF'));
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

const IMAGE_MIMETYPES = /^image\/(jpeg|jpg|png|webp)$/i;
const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 85;

/**
 * Comprime una imagen a JPEG para subida. Si no es imagen o falla, devuelve el buffer original.
 */
async function compressImageForUpload(
  inputBuffer: Buffer,
  mimetype: string
): Promise<Buffer> {
  if (!IMAGE_MIMETYPES.test(mimetype)) {
    return inputBuffer;
  }
  try {
    const compressed = await sharp(inputBuffer)
      .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();
    return compressed;
  } catch (err) {
    console.warn('[FTP UPLOAD] Compresión fallida, usando original:', err);
    return inputBuffer;
  }
}

/**
 * Obtiene el buffer de un archivo Multer (memoria o disco)
 */
function getFileBuffer(file: MulterFile): Buffer {
  if (file.buffer) return file.buffer;
  if (file.path && fs.existsSync(file.path)) {
    return fs.readFileSync(file.path);
  }
  throw new Error('Archivo no tiene buffer ni path disponible');
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

    // Usar la misma función de detección
    const isServerless = isServerlessEnvironment();

    console.log('📁 [FTP UPLOAD] Iniciando proceso de subida');
    console.log('📁 [FTP UPLOAD] Opciones:', {
      productoId,
      nombreBase,
      color,
      cantidadArchivos: files.length,
      isServerless,
      envVars: {
        VERCEL: !!process.env.VERCEL,
        VERCEL_ENV: process.env.VERCEL_ENV,
        NODE_ENV: process.env.NODE_ENV,
      },
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

    const tempFiles: string[] = []; // Para limpiar archivos temporales en desarrollo

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

          console.log(`📤 [FTP UPLOAD] Procesando archivo ${i + 1}/${files.length}:`, {
            originalname: file.originalname,
            size: `${(file.size / 1024).toFixed(2)} KB`,
            hasBuffer: !!file.buffer,
            hasPath: !!file.path,
          });

          if (file.path) tempFiles.push(file.path);

          const inputBuffer = getFileBuffer(file);
          const compressedBuffer = await compressImageForUpload(inputBuffer, file.mimetype);

          const imageNumber = await getNextImageNumber(folderPath, baseFilename);
          console.log(`🔢 [FTP UPLOAD] Número secuencial obtenido: ${imageNumber}`);

          const filename = `${baseFilename}-${imageNumber}.jpg`;
          const remotePath = `${folderPath}/${filename}`;

          console.log(`📝 [FTP UPLOAD] Nombre de archivo generado: ${filename}`);
          await ftpService.uploadFileFromBuffer(compressedBuffer, remotePath);

          uploadedFiles.push(remotePath);
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
        for (const remotePath of uploadedFiles) {
          try {
            console.log(`🧹 [FTP UPLOAD] Eliminando archivo remoto: ${remotePath}`);
            await ftpService.deleteFile(remotePath);
          } catch (cleanupError) {
            console.error('❌ [FTP UPLOAD] Error al limpiar archivo remoto:', cleanupError);
          }
        }
        throw error;
      } finally {
        // Limpiar archivos temporales solo en desarrollo
        if (!isServerless) {
          console.log('🧹 [FTP UPLOAD] Limpiando archivos temporales...');
          for (const tempPath of tempFiles) {
            cleanupTempFile(tempPath);
          }
        }
        console.log('🔌 [FTP UPLOAD] Desconectando del servidor FTP...');
        await ftpService.disconnect();
        console.log('✅ [FTP UPLOAD] Desconexión completada');
      }
    } catch (error) {
      // Limpiar archivos temporales en caso de error (solo desarrollo)
      if (!isServerless) {
        console.error('❌ [FTP UPLOAD] Error general, limpiando archivos temporales:', error);
        for (const tempPath of tempFiles) {
          cleanupTempFile(tempPath);
        }
      }
      throw error;
    }
  }

  /**
   * Sube un documento (tabla de talles o ficha técnica) al FTP
   * Path resultante: products/{slugProducto}/docs/{tipo}.{ext}
   */
  async uploadDocument(options: {
    nombreBase: string;
    tipo: 'tabla-talles' | 'ficha-tecnica';
    file: MulterFile;
  }): Promise<string> {
    const { nombreBase, tipo, file } = options;

    const folderName = slugifyProductName(nombreBase);
    const folderPath = `${folderName}/docs`;
    const isImage = file.mimetype.startsWith('image/');
    const ext = isImage ? '.jpg' : (path.extname(file.originalname).toLowerCase() || '.pdf');
    const filename = `${tipo}${ext}`;
    const remotePath = `${folderPath}/${filename}`;

    console.log(`📄 [DOC UPLOAD] Subiendo documento: ${filename} → ${remotePath}`);

    try {
      await ftpService.connect();
      await ftpService.ensureDirectory(folderPath);

      if (isImage) {
        const inputBuffer = getFileBuffer(file);
        const compressedBuffer = await compressImageForUpload(inputBuffer, file.mimetype);
        await ftpService.uploadFileFromBuffer(compressedBuffer, remotePath);
        if (file.path) cleanupTempFile(file.path);
      } else {
        if (file.buffer) {
          await ftpService.uploadFileFromBuffer(file.buffer, remotePath);
        } else if (file.path) {
          await ftpService.uploadFile(file.path, remotePath);
          cleanupTempFile(file.path);
        } else {
          throw new Error('Archivo no tiene buffer ni path disponible');
        }
      }

      await ftpService.disconnect();

      const publicPath = `products/${remotePath}`;
      console.log(`✅ [DOC UPLOAD] Documento subido: ${publicPath}`);
      return publicPath;
    } catch (error) {
      try { await ftpService.disconnect(); } catch { /* ignore */ }
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

