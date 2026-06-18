import type { InstallmentQuote, InstallmentQuoteInput } from '../../types/installment.types';

export interface InstallmentProvider {
  readonly id: string;
  quote(input: InstallmentQuoteInput): Promise<InstallmentQuote | null>;
}
