# Oathkeeper

An online Dungeons & Dragons character tracker and community app in early
development. Requires Node.js 24+ and npm 11; uses npm workspaces and Turborepo.

## Current build

The home page provides a 2014 fifth edition character worksheet with ability
modifiers, proficiency, saving throws, initiative, manual adjustments, and notes.
Download and restore JSON save files, with a review before replacing the current
worksheet. Work lives only in the current tab until downloaded.

The Community tab now provides accounts, public posts and comments, private
invitation-only groups, group messages, uploads, and public reporting. Posts and
messages persist in MongoDB. Development uploads persist in `.data/uploads`.
Photos allow 100 MB, videos 500 MB, and PDFs/other files 1 GB each, with a 5 GB
app-wide storage cap. Chat refreshes every three seconds.

Guided character creation/leveling, online character storage, and PDF character
import are not implemented yet. Community accounts do not save character
worksheets. See [community setup and testing](docs/community.md),
[the roadmap](docs/roadmap.md), and [rules sources](docs/rules-sources.md).

## Verification

```bash
npm test
npm run test:integration # Requires local MongoDB
npm run typecheck
npm run build
```

Unit tests use Node's built-in test runner and require no database. They cover
character calculations, save files, upload-limit policy, and deletion permissions.
Community integration tests run against real MongoDB in an isolated temporary
database, covering account sessions, access checks, uploads, quota recovery,
comments, messages, and moderation. They delete only their own test database.

To try the worksheet without MongoDB, run
`npm run dev --workspace=@oathkeeper/frontend` and open http://localhost:5173.
Change Dexterity and level, mark a saving throw proficient, and add manual
adjustments. Download, edit the worksheet, then restore the file; verify both
cancel and replace in the review. Invalid number fields should block downloading.

To try Community, start MongoDB and both development servers with the commands
below. Use a regular browser window and a private window for two separate
accounts. Follow [the local walkthrough](docs/community.md). Frontend-only mode
can show the worksheet but cannot load the community API.

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

Render Free is the selected app host. The root `render.yaml` configures a Docker
web service and prompts for a private `MONGODB_URI`. See
[hosting and owner next steps](docs/hosting.md) for database setup and deployment.
The configuration has not yet been deployed to Render.

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
