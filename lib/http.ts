import { NextResponse } from "next/server";

export type SuccessResponse<T> = {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
};

export type ErrorResponse = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export function ok<T>(data: T, meta?: Record<string, unknown>) {
  const body: SuccessResponse<T> = meta ? { success: true, data, meta } : { success: true, data };
  return NextResponse.json(body);
}

export function fail(code: string, message: string, status = 400, details?: unknown) {
  const body: ErrorResponse = { success: false, error: { code, message, details } };
  return NextResponse.json(body, { status });
}
