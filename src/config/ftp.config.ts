export interface FTPConfig {
  host: string;
  user: string;
  password: string;
  port: number;
  basePath: string;
  publicUrl: string;
}

export function getFTPConfig(): FTPConfig {
  const host = process.env.FTP_HOST;
  const user = process.env.FTP_USER;
  const password = process.env.FTP_PASSWORD;

  if (!host || !user || !password) {
    throw new Error(
      'FTP configuration missing. Please set FTP_HOST, FTP_USER, and FTP_PASSWORD in .env'
    );
  }

  return {
    host,
    user,
    password,
    port: parseInt(process.env.FTP_PORT || '21', 10),
    basePath: process.env.FTP_BASE_PATH || '/public_html/productos',
    publicUrl: process.env.IMAGE_BASE_URL || '',
  };
}

