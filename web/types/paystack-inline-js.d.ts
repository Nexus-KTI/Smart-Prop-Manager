declare module "@paystack/inline-js" {
  export type PaystackSuccessResponse = {
    reference: string;
    trans?: string;
    status?: string;
    message?: string;
    transaction?: string;
    trxref?: string;
  };

  export type NewTransactionOptions = {
    key: string;
    email: string;
    amount: number;
    currency?: string;
    ref?: string;
    metadata?: Record<string, unknown>;
    onSuccess?: (transaction: PaystackSuccessResponse) => void;
    onCancel?: () => void;
    onError?: (error: { message: string }) => void;
  };

  export default class PaystackPop {
    newTransaction(options: NewTransactionOptions): void;
  }
}
