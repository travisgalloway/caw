export type RouteHandler = (
  req: Request,
  params: Record<string, string>,
) => Response | Promise<Response>;

interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

export interface Router {
  get: (path: string, handler: RouteHandler) => void;
  post: (path: string, handler: RouteHandler) => void;
  put: (path: string, handler: RouteHandler) => void;
  delete: (path: string, handler: RouteHandler) => void;
  handle: (req: Request) => Response | Promise<Response>;
}

function pathToRegex(path: string): { pattern: RegExp; paramNames: string[] } {
  const paramNames: string[] = [];
  const regexStr = path.replace(/:([a-zA-Z_]+)/g, (_, name) => {
    paramNames.push(name);
    return '([^/]+)';
  });
  return { pattern: new RegExp(`^${regexStr}$`), paramNames };
}

export function createRouter(): Router {
  const routes: Route[] = [];

  function addRoute(method: string, path: string, handler: RouteHandler) {
    const { pattern, paramNames } = pathToRegex(path);
    routes.push({ method, pattern, paramNames, handler });
  }

  return {
    get: (path, handler) => addRoute('GET', path, handler),
    post: (path, handler) => addRoute('POST', path, handler),
    put: (path, handler) => addRoute('PUT', path, handler),
    delete: (path, handler) => addRoute('DELETE', path, handler),
    handle(req: Request): Response | Promise<Response> {
      const url = new URL(req.url);
      const method = req.method;
      const pathname = url.pathname;

      for (const route of routes) {
        if (route.method !== method) continue;
        const match = pathname.match(route.pattern);
        if (!match) continue;

        const params: Record<string, string> = {};
        for (let i = 0; i < route.paramNames.length; i++) {
          params[route.paramNames[i]] = match[i + 1];
        }

        return route.handler(req, params);
      }

      return new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Not Found' } }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  };
}
