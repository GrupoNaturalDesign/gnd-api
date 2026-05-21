/**
 * Logs estructurados para el módulo de envíos (sin console.log).
 * Una línea JSON por evento en stdout / stderr.
 */

type ShippingLogLevel = 'info' | 'warn' | 'error';

function writeLine(
  level: ShippingLogLevel,
  message: string,
  context?: Record<string, unknown>
): void {
  const line = JSON.stringify({
    module: 'shipping',
    level,
    message,
    t: new Date().toISOString(),
    ...context,
  });
  if (level === 'error') {
    process.stderr.write(`${line}\n`);
  } else {
    process.stdout.write(`${line}\n`);
  }
}

export const shippingLogger = {
  info(message: string, context?: Record<string, unknown>): void {
    writeLine('info', message, context);
  },
  warn(message: string, context?: Record<string, unknown>): void {
    writeLine('warn', message, context);
  },
  error(message: string, context?: Record<string, unknown>): void {
    writeLine('error', message, context);
  },
};
