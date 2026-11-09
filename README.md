# Oathkeeper

An npm workspaces monorepo managed by Turborepo. Requires Node.js 24+ and npm 11.

```text
apps/
  frontend/   React Router SSR app, React, Tailwind CSS, and Vite
  backend/    Express API and production frontend server
```

## Development

```bash
npm ci
npm run dev
```

Open http://localhost:5173. The frontend proxies `/api` requests to the backend
on port 3000. `GET /api/health` returns `{ "status": "ok" }`; unknown API routes
return a JSON 404. Add API routes in `apps/backend/src/index.ts` before the API
404 handler.

Run either workspace independently with `npm run dev --workspace=@oathkeeper/frontend`
or `npm run dev --workspace=@oathkeeper/backend`.

The backend accepts `HOST` and `PORT` environment variables. If you change the
backend development port, update the proxy in `apps/frontend/vite.config.ts`.
Browser code can use relative `/api/...` URLs in both environments. Server-side
loaders need an absolute URL when fetching the API.

## Production

```bash
npm run typecheck
npm run build
npm start
```

Turborepo builds and caches both workspaces. The production Express server serves
the API, static assets, and React Router SSR at http://localhost:3000.
Build both workspaces before starting the production server.

## Docker

One multi-stage Dockerfile installs dependencies, builds both workspaces, installs
production dependencies, and produces a non-root Node.js runtime with a health check.

```bash
docker build -t oathkeeper .
docker run --rm -p 3000:3000 oathkeeper
```

The frontend and API share port 3000 and one Node process. Development dependencies
and source files are excluded from the final image.

Configuration references: [Turborepo tasks](https://turborepo.dev/docs/crafting-your-repository/configuring-tasks)
and [React Router custom servers](https://reactrouter.com/tutorials/quickstart).
