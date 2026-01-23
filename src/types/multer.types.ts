/**
 * Tipos para Multer - Evita problemas de recursión en TypeScript
 * Define el tipo manualmente para evitar problemas con tipos profundos
 */
export interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination: string;
  filename: string;
  path: string;
  buffer?: Buffer;
}
