// Shared shape for API error responses. Used by the Fastify error handler
// on the backend and by the typed fetch client on the frontend.
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export const ErrorCode = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  INSUFFICIENT_STOCK: "INSUFFICIENT_STOCK",
  DOCUMENT_ALREADY_CONFIRMED: "DOCUMENT_ALREADY_CONFIRMED",
  DOCUMENT_NOT_CONFIRMED: "DOCUMENT_NOT_CONFIRMED",
  BATCH_ALREADY_CONSUMED: "BATCH_ALREADY_CONSUMED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
