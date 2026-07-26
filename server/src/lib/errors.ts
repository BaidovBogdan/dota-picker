export type ErrorCode =
  | 'AUTH_REQUIRED'
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_EXISTS'
  | 'ACCOUNT_CONFLICT'
  | 'TOKEN_INVALID'
  | 'TOKEN_REUSED'
  | 'QUOTA_EXHAUSTED'
  | 'ANALYSIS_ALREADY_RESERVED'
  | 'HERO_NOT_FOUND'
  | 'INVALID_DRAFT'
  | 'IDEMPOTENCY_REQUIRED'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'REQUEST_IN_PROGRESS'
  | 'EXTERNAL_SERVICE_UNAVAILABLE'
  | 'IMAGE_RECOGNITION_FAILED'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  public constructor(
    public readonly statusCode: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class UnauthorizedError extends AppError {
  public constructor(code: ErrorCode = 'AUTH_REQUIRED', message = 'Authentication is required') {
    super(401, code, message);
  }
}

export class ConflictError extends AppError {
  public constructor(code: ErrorCode, message: string, details?: unknown) {
    super(409, code, message, details);
  }
}

export class NotFoundError extends AppError {
  public constructor(message = 'Resource not found') {
    super(404, 'NOT_FOUND', message);
  }
}

export class ExternalServiceError extends AppError {
  public constructor(message: string, details?: unknown) {
    super(503, 'EXTERNAL_SERVICE_UNAVAILABLE', message, details);
  }
}
