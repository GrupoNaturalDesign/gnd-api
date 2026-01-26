import { Client } from 'basic-ftp';
import { getFTPConfig, type FTPConfig } from '../config/ftp.config';
import * as path from 'path';
import { Readable } from 'stream';

export class FTPService {
  private _config: FTPConfig | null = null;
  private client: Client | null = null;

  private get config(): FTPConfig {
    if (!this._config) {
      this._config = getFTPConfig();
    }
    return this._config;
  }

  /**
   * Conecta al servidor FTP
   */
  async connect(): Promise<void> {
    try {
      this.client = new Client();
      this.client.ftp.verbose = process.env.NODE_ENV === 'development';

      await this.client.access({
        host: this.config.host,
        user: this.config.user,
        password: this.config.password,
        port: this.config.port,
      });

      // Cambiar al directorio base
      await this.client.cd(this.config.basePath);
    } catch (error) {
      console.error('Error connecting to FTP:', error);
      throw new Error(`Failed to connect to FTP server: ${error}`);
    }
  }

  /**
   * Desconecta del servidor FTP
   */
  async disconnect(): Promise<void> {
    try {
      if (this.client) {
        this.client.close();
        this.client = null;
      }
    } catch (error) {
      console.error('Error disconnecting from FTP:', error);
    }
  }

  /**
   * Verifica si existe un directorio
   */
  async directoryExists(dirPath: string): Promise<boolean> {
    try {
      if (!this.client) {
        await this.connect();
      }
      if (!this.client) {
        return false;
      }
      await this.client.cd(dirPath);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Crea un directorio (y sus padres si no existen)
   */
  async ensureDirectory(dirPath: string): Promise<void> {
    try {
      if (!this.client) {
        await this.connect();
      }
      if (!this.client) {
        throw new Error('FTP client not connected');
      }

      // Volver al directorio base
      await this.client.cd(this.config.basePath);

      const parts = dirPath.split('/').filter((p) => p);
      let currentPath = '';

      for (const part of parts) {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const exists = await this.directoryExists(currentPath);
        if (!exists) {
          await this.client.ensureDir(currentPath);
        }
      }
    } catch (error) {
      console.error(`Error creating directory ${dirPath}:`, error);
      throw new Error(`Failed to create directory: ${error}`);
    }
  }

  /**
   * Sube un archivo al servidor FTP
   * @param localPath Ruta local del archivo
   * @param remotePath Ruta remota donde subir (relativa a basePath)
   */
  async uploadFile(localPath: string, remotePath: string): Promise<void> {
    try {
      if (!this.client) {
        await this.connect();
      }
      if (!this.client) {
        throw new Error('FTP client not connected');
      }

      // Asegurar que el directorio remoto existe
      const remoteDir = path.dirname(remotePath);
      if (remoteDir !== '.') {
        await this.ensureDirectory(remoteDir);
      }

      // Volver al directorio base
      await this.client.cd(this.config.basePath);

      // Subir el archivo
      await this.client.uploadFrom(localPath, remotePath);
    } catch (error) {
      console.error(`Error uploading file ${localPath} to ${remotePath}:`, error);
      throw new Error(`Failed to upload file: ${error}`);
    }
  }

  /**
   * Sube un archivo desde un Buffer (para producción serverless)
   * @param buffer Buffer con el contenido del archivo
   * @param remotePath Ruta remota donde subir (relativa a basePath)
   */
  async uploadFileFromBuffer(buffer: Buffer, remotePath: string): Promise<void> {
    try {
      if (!this.client) {
        await this.connect();
      }
      if (!this.client) {
        throw new Error('FTP client not connected');
      }

      // Asegurar que el directorio remoto existe
      const remoteDir = path.dirname(remotePath);
      if (remoteDir !== '.') {
        await this.ensureDirectory(remoteDir);
      }

      // Volver al directorio base
      await this.client.cd(this.config.basePath);

      // Crear un stream desde el buffer
      const stream = Readable.from(buffer);

      // Subir el archivo desde el stream
      await this.client.uploadFrom(stream, remotePath);
    } catch (error) {
      console.error(`Error uploading buffer to ${remotePath}:`, error);
      throw new Error(`Failed to upload file from buffer: ${error}`);
    }
  }

  /**
   * Elimina un archivo del servidor FTP
   */
  async deleteFile(remotePath: string): Promise<void> {
    try {
      if (!this.client) {
        await this.connect();
      }
      if (!this.client) {
        throw new Error('FTP client not connected');
      }

      await this.client.remove(remotePath);
    } catch (error) {
      console.error(`Error deleting file ${remotePath}:`, error);
      throw new Error(`Failed to delete file: ${error}`);
    }
  }

  /**
   * Lista archivos en un directorio
   */
  async listFiles(dirPath: string): Promise<string[]> {
    try {
      if (!this.client) {
        await this.connect();
      }
      if (!this.client) {
        throw new Error('FTP client not connected');
      }

      await this.client.cd(this.config.basePath);
      if (dirPath) {
        await this.client.cd(dirPath);
      }

      const files = await this.client.list();
      return files
        .filter((file) => file.isFile)
        .map((file) => file.name);
    } catch (error) {
      console.error(`Error listing files in ${dirPath}:`, error);
      return [];
    }
  }

  /**
   * Obtiene la URL pública de una imagen
   */
  getPublicUrl(remotePath: string): string {
    const cleanPath = remotePath.startsWith('/') ? remotePath.slice(1) : remotePath;
    return `${this.config.publicUrl}/${cleanPath}`.replace(/\/+/g, '/');
  }
}

export const ftpService = new FTPService();

