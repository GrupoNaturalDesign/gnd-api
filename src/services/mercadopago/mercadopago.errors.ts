/**
 * Error al llamar a la API de Mercado Pago (HTTP no OK o cuerpo inválido).
 */
export class MercadoPagoApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown
  ) {
    super(message);
    this.name = 'MercadoPagoApiError';
    Object.setPrototypeOf(this, MercadoPagoApiError.prototype);
  }
}

export class MercadoPagoConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MercadoPagoConfigError';
    Object.setPrototypeOf(this, MercadoPagoConfigError.prototype);
  }
}
