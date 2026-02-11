export enum KYAErrorCode {
  VALIDATION_ERROR = "VALIDATION_ERROR",
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",
  NOT_FOUND = "NOT_FOUND",
  CONFLICT = "CONFLICT",
  RATE_LIMITED = "RATE_LIMITED",
  SERVER_ERROR = "SERVER_ERROR",
  NETWORK_ERROR = "NETWORK_ERROR",
}

const statusToCode: Record<number, KYAErrorCode> = {
  400: KYAErrorCode.VALIDATION_ERROR,
  401: KYAErrorCode.UNAUTHORIZED,
  403: KYAErrorCode.FORBIDDEN,
  404: KYAErrorCode.NOT_FOUND,
  409: KYAErrorCode.CONFLICT,
  429: KYAErrorCode.RATE_LIMITED,
};

export class KYAError extends Error {
  readonly code: KYAErrorCode;
  readonly status: number | undefined;

  constructor(code: KYAErrorCode, message: string, status?: number) {
    super(message);
    this.name = "KYAError";
    this.code = code;
    this.status = status;
  }

  static fromStatus(status: number, message: string): KYAError {
    const code =
      statusToCode[status] ??
      (status >= 500 ? KYAErrorCode.SERVER_ERROR : KYAErrorCode.SERVER_ERROR);
    return new KYAError(code, message, status);
  }

  static networkError(cause: unknown): KYAError {
    const message =
      cause instanceof Error ? cause.message : "Network request failed";
    return new KYAError(KYAErrorCode.NETWORK_ERROR, message);
  }
}
