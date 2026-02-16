const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function ok<T>(
  data: T,
  meta?: { total?: number; offset?: number; limit?: number },
): Response {
  const body: { data: T; meta?: typeof meta } = { data };
  if (meta) body.meta = meta;
  return new Response(JSON.stringify(body), { status: 200, headers: JSON_HEADERS });
}

export function created<T>(data: T): Response {
  return new Response(JSON.stringify({ data }), { status: 201, headers: JSON_HEADERS });
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
}

export function badRequest(message: string, code = 'BAD_REQUEST'): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status: 400,
    headers: JSON_HEADERS,
  });
}

export function notFound(message: string): Response {
  return new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message } }), {
    status: 404,
    headers: JSON_HEADERS,
  });
}

export function conflict(message: string): Response {
  return new Response(JSON.stringify({ error: { code: 'CONFLICT', message } }), {
    status: 409,
    headers: JSON_HEADERS,
  });
}

export function serverError(message: string): Response {
  return new Response(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message } }), {
    status: 500,
    headers: JSON_HEADERS,
  });
}

export async function parseBody<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

export function getSearchParams(req: Request): URLSearchParams {
  return new URL(req.url).searchParams;
}
