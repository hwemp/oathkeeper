import { createRequestHandler } from "@react-router/express";
import express from "express";
import { fileURLToPath } from "node:url";

const production = process.env.NODE_ENV === "production";

const app = express();
app.disable("x-powered-by");

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok" });
});

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

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close((error) => process.exit(error ? 1 : 0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
