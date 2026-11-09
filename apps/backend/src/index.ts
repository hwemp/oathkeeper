import { createRequestHandler } from "@react-router/express";
import express from "express";
import { fileURLToPath } from "node:url";
import { connectDatabase, database, mongoClient, pingDatabase } from "./database.js";
import { createCommunityRouter } from "./community/router.js";

const production = process.env.NODE_ENV === "production";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: '32kb' }));

app.get("/api/health", async (_request, response) => {
  try {
    await pingDatabase();
    response.json({ status: "ok" });
  } catch {
    response.status(503).json({ status: "unavailable" });
  }
});

try {
  await connectDatabase();
  app.use('/api/community', await createCommunityRouter(database, {
    directory: process.env.UPLOAD_DIR ?? (production ? null : fileURLToPath(new URL('../../../.data/uploads/', import.meta.url))),
    secureCookies: production && process.env.COOKIE_SECURE !== 'false',
    moderator: process.env.MODERATOR_USERNAME,
  }));
} catch {
  console.error('Could not initialize community storage. Check MongoDB and UPLOAD_DIR.');
  await mongoClient.close();
  process.exit(1);
}

app.use("/api", (_request, response) => {
  response.status(404).json({ error: "Not found" });
});

// Serve the frontend build in production; Vite handles it during development.
if (production) {
  const clientDirectory = fileURLToPath(new URL("../../frontend/build/client/", import.meta.url));
  const serverBuildUrl = new URL("../../frontend/build/server/index.js", import.meta.url);
  const build = await import(serverBuildUrl.href);

  app.use("/assets", express.static(`${clientDirectory}/assets`, { immutable: true, maxAge: "1y" }));
  app.use(express.static(clientDirectory, { maxAge: "1h" }));
  app.use(createRequestHandler({ build, mode: "production" }));
}

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";
const server = app.listen(port, host, () => {
  console.log(`Oathkeeper backend listening on http://${host}:${port}`);
});

server.on("error", async () => {
  console.error("Backend HTTP server failed to start.");
  await mongoClient.close();
  process.exit(1);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close(async (error) => {
      try {
        await mongoClient.close();
        process.exit(error ? 1 : 0);
      } catch {
        process.exit(1);
      }
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
