export type ErrorResponse = {
  ok: false;
  code: string;
  message: string;
  details?: unknown;
};

export function toErrorResponse(code: string, message: string, details?: unknown): ErrorResponse {
  return { ok: false, code, message, details };
}


