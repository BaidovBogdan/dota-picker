export class DesktopError extends Error {
  readonly code: string;
  readonly status: number | null;
  readonly details?: unknown;

  constructor(code: string, message: string, status: number | null = null, details?: unknown) {
    super(message);
    this.name = 'DesktopError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function normalizeError(error: unknown) {
  if (error instanceof DesktopError) {
    return {
      code: error.code,
      message: error.message,
      status: error.status,
      ...(error.details === undefined ? {} : { details: error.details }),
    };
  }
  if (error instanceof Error) {
    return {
      code: 'DESKTOP_ERROR',
      message: error.message,
      status: null,
    };
  }
  return {
    code: 'UNKNOWN_ERROR',
    message: 'Неизвестная ошибка',
    status: null,
  };
}
