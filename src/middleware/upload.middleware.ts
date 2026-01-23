import { Request, Response, NextFunction } from 'express';
import { upload } from '../services/imageUpload.service';

/**
 * Middleware para manejar múltiples archivos
 */
export const uploadMultiple = (fieldName: string, maxCount: number = 10) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const uploadMiddleware = upload.array(fieldName, maxCount);
    uploadMiddleware(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          error: err.message,
          message: 'Error al procesar archivos',
        });
      }
      next();
    });
  };
};

/**
 * Middleware para manejar un solo archivo
 */
export const uploadSingle = (fieldName: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const uploadMiddleware = upload.single(fieldName);
    uploadMiddleware(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          error: err.message,
          message: 'Error al procesar archivo',
        });
      }
      next();
    });
  };
};

