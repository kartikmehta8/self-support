export class AppError extends Error {
  public readonly cause?: unknown;

  /**
   * Creates an operational application error.
   *
   * @param message Human-readable error message.
   * @param cause Optional underlying cause.
   */
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "AppError";
    this.cause = cause;
  }
}

/**
 * Converts an unknown thrown value into an Error.
 *
 * @param error Unknown thrown value.
 * @returns Error instance.
 */
export function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error));
}
