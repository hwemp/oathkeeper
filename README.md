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
docker compose up -d mongo
npm run dev
```

Open http://localhost:5173. The frontend proxies `/api` requests to the backend
on port 3000. `GET /api/health` pings MongoDB and returns `{ "status": "ok" }`
when available, or HTTP 503 when unavailable; unknown API routes
return a JSON 404. Add API routes in `apps/backend/src/index.ts` before the API
404 handler.

Run either workspace independently with `npm run dev --workspace=@oathkeeper/frontend`
or `npm run dev --workspace=@oathkeeper/backend`.

The backend uses Express 5 and the official MongoDB Node.js driver. It connects to
MongoDB before listening and closes the connection on shutdown. Import `database`
from `apps/backend/src/database.ts` in backend routes to access collections.

The backend accepts `HOST`, `PORT`, and `MONGODB_URI` environment variables.
`MONGODB_URI` defaults to `mongodb://127.0.0.1:27017/oathkeeper` outside Docker;
include the database name in a custom URI. Export environment variables in your
shell when running npm commands (local `.env` files are not loaded automatically).
If you change the
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
MongoDB must be running; set `MONGODB_URI` to use an external database.

## Docker

One multi-stage Dockerfile installs dependencies, builds both workspaces, installs
production dependencies, and produces a non-root Node.js runtime with a health check.

```bash
docker compose up --build -d
```

The frontend and API share port 3000 and one Node process. Development dependencies
and source files are excluded from the final image.

Compose starts MongoDB 8, waits for its health check, and starts the app. Database
files persist in the `mongo-data` volume across container restarts. MongoDB is
available on localhost port 27017 for development; the app connects through the
internal Docker network. This local setup has no database authentication. Use an
authenticated MongoDB deployment and set `MONGODB_URI` for production hosting.

To run only the app image against an existing MongoDB deployment:

```bash
docker build -t oathkeeper .
docker run --rm -p 3000:3000 -e MONGODB_URI="mongodb://your-mongo-host:27017/oathkeeper" oathkeeper
```

The driver setup follows the [MongoDB connection documentation](https://www.mongodb.com/docs/drivers/node/current/connect/mongoclient/).

Configuration references: [Turborepo tasks](https://turborepo.dev/docs/crafting-your-repository/configuring-tasks)
and [React Router custom servers](https://reactrouter.com/tutorials/quickstart).
