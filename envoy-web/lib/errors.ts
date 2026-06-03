import { NextResponse } from 'next/server';

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function created<T>(data: T) {
  return NextResponse.json(data, { status: 201 });
}

export function noContent() {
  return new NextResponse(null, { status: 204 });
}

export function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export const unauthorized = () => err('UNAUTHORIZED', 'Authentication required.', 401);
export const forbidden = (msg = 'Access denied.') => err('FORBIDDEN', msg, 403);
export const notFound = (msg = 'Resource not found.') => err('NOT_FOUND', msg, 404);
export const conflict = (msg: string) => err('CONFLICT', msg, 409);
export const preconditionFailed = (msg: string) => err('PRECONDITION_FAILED', msg, 412);
export const unprocessable = (msg: string) => err('UNPROCESSABLE', msg, 422);
export const serverError = (msg = 'An unexpected error occurred.') =>
  err('INTERNAL_ERROR', msg, 500);
