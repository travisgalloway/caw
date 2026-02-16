import { describe, expect, test } from 'bun:test';
import { createRouter } from './router';

describe('router', () => {
  test('matches GET routes', async () => {
    const router = createRouter();
    router.get('/api/test', () => new Response('ok'));

    const res = await router.handle(new Request('http://localhost/api/test'));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });

  test('matches POST routes', async () => {
    const router = createRouter();
    router.post('/api/test', () => new Response('created', { status: 201 }));

    const res = await router.handle(new Request('http://localhost/api/test', { method: 'POST' }));
    expect(res.status).toBe(201);
  });

  test('extracts path parameters', async () => {
    const router = createRouter();
    router.get('/api/items/:id', (_, params) => new Response(params.id));

    const res = await router.handle(new Request('http://localhost/api/items/abc123'));
    expect(await res.text()).toBe('abc123');
  });

  test('extracts multiple path parameters', async () => {
    const router = createRouter();
    router.get('/api/workflows/:wfId/tasks/:taskId', (_, params) => {
      return new Response(JSON.stringify(params));
    });

    const res = await router.handle(new Request('http://localhost/api/workflows/wf_1/tasks/tk_2'));
    const body = await res.json();
    expect(body).toEqual({ wfId: 'wf_1', taskId: 'tk_2' });
  });

  test('returns 404 for unmatched routes', async () => {
    const router = createRouter();
    router.get('/api/test', () => new Response('ok'));

    const res = await router.handle(new Request('http://localhost/api/other'));
    expect(res.status).toBe(404);
  });

  test('differentiates methods', async () => {
    const router = createRouter();
    router.get('/api/test', () => new Response('GET'));
    router.post('/api/test', () => new Response('POST'));

    const getRes = await router.handle(new Request('http://localhost/api/test'));
    expect(await getRes.text()).toBe('GET');

    const postRes = await router.handle(
      new Request('http://localhost/api/test', { method: 'POST' }),
    );
    expect(await postRes.text()).toBe('POST');
  });
});
