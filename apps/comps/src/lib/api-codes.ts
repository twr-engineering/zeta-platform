/** Error codes and HTTP statuses of app PRD §14.1 (no Next imports, so scripts and tests can use them). */
export type ApiErrorCode =
  | 'bad_request'
  | 'unauthenticated'
  | 'invalid_credentials'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'validation'
  | 'rate_limited'
  | 'server'

export const STATUS: Record<ApiErrorCode, number> = {
  bad_request: 400,
  unauthenticated: 401,
  invalid_credentials: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  validation: 422,
  rate_limited: 429,
  server: 500,
}
