export type ErrorCode =
  | 'AUTH_REQUIRED'
  | 'ADMIN_AUTH_REQUIRED'
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_EXISTS'
  | 'ACCOUNT_CONFLICT'
  | 'TOKEN_INVALID'
  | 'TOKEN_REUSED'
  | 'OTP_INVALID'
  | 'OTP_EXPIRED'
  | 'OTP_ATTEMPTS_EXHAUSTED'
  | 'QUOTA_EXHAUSTED'
  | 'ANALYSIS_ALREADY_RESERVED'
  | 'HERO_NOT_FOUND'
  | 'INVALID_DRAFT'
  | 'INVALID_REVIEW'
  | 'ANALYSIS_REVIEWED'
  | 'IDEMPOTENCY_REQUIRED'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'DIAGNOSTIC_EVENT_CONFLICT'
  | 'DIAGNOSTIC_SESSION_CONFLICT'
  | 'DIAGNOSTIC_SESSION_EXPIRED'
  | 'DIAGNOSTIC_TIMESTAMP_INVALID'
  | 'DIAGNOSTIC_QUOTA_EXCEEDED'
  | 'REQUEST_IN_PROGRESS'
  | 'RATE_LIMITED'
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

export class RateLimitError extends AppError {
  public constructor(message: string, retryAfterSeconds: number) {
    super(429, 'RATE_LIMITED', message, { retryAfterSeconds });
  }
}

export class OtpError extends AppError {
  public constructor(
    code: 'OTP_INVALID' | 'OTP_EXPIRED' | 'OTP_ATTEMPTS_EXHAUSTED',
    message: string,
  ) {
    const statusCode = code === 'OTP_INVALID' ? 400 : code === 'OTP_EXPIRED' ? 410 : 429;
    super(statusCode, code, message);
  }
}
