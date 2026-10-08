import { ErrorCode, type ErrorCode as ErrorCodeType } from "@oboishop/shared";

// Domain error classes. Route handlers throw these; the Fastify error
// handler (registered in app.ts) maps them to the correct HTTP status and
// the shared ApiErrorBody shape — so every endpoint returns errors the same
// way instead of leaking raw exceptions or ad-hoc response shapes.
export class AppError extends Error {
  readonly code: ErrorCodeType;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(code: ErrorCodeType, message: string, statusCode: number, details?: unknown) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(ErrorCode.VALIDATION_ERROR, message, 400, details);
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, id?: string) {
    super(ErrorCode.NOT_FOUND, `${entity} topilmadi${id ? ` (id: ${id})` : ""}`, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(ErrorCode.CONFLICT, message, 409, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Avtorizatsiyadan o'tilmagan") {
    super(ErrorCode.UNAUTHORIZED, message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Ruxsat yo'q") {
    super(ErrorCode.FORBIDDEN, message, 403);
  }
}

export class InsufficientStockError extends AppError {
  constructor(productName: string, requested: number | string, available: number | string) {
    super(
      ErrorCode.INSUFFICIENT_STOCK,
      `"${productName}" uchun qoldiq yetarli emas (so'ralgan: ${requested}, mavjud: ${available})`,
      409,
      { productName, requested, available },
    );
  }
}

export class DocumentAlreadyConfirmedError extends AppError {
  constructor() {
    super(ErrorCode.DOCUMENT_ALREADY_CONFIRMED, "Hujjat allaqachon tasdiqlangan", 409);
  }
}

export class DocumentNotConfirmedError extends AppError {
  constructor() {
    super(ErrorCode.DOCUMENT_NOT_CONFIRMED, "Hujjat hali tasdiqlanmagan", 409);
  }
}

export class BatchAlreadyConsumedError extends AppError {
  constructor() {
    super(
      ErrorCode.BATCH_ALREADY_CONSUMED,
      "Bu partiyadan allaqachon sotilgan, kirimni bekor qilib bo'lmaydi. Hisobdan chiqarish orqali to'g'irlang.",
      409,
    );
  }
}
