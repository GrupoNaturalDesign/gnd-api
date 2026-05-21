export class ShippingMethodNotSupportedError extends Error {
  constructor(message: string = 'Andreani: método no implementado todavía') {
    super(message);
    this.name = 'ShippingMethodNotSupportedError';
    Object.setPrototypeOf(this, ShippingMethodNotSupportedError.prototype);
  }
}

export class ShippingConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShippingConfigError';
    Object.setPrototypeOf(this, ShippingConfigError.prototype);
  }
}

export class ShippingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShippingValidationError';
    Object.setPrototypeOf(this, ShippingValidationError.prototype);
  }
}

export class ShippingHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown
  ) {
    super(message);
    this.name = 'ShippingHttpError';
    Object.setPrototypeOf(this, ShippingHttpError.prototype);
  }
}
