declare global {
  namespace Express {
    interface Request {
      userId?: number;
      userEmail?: string;
      empresaId?: number;
    }
  }
}

export {};
