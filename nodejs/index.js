const express = require("express");
const client = require("prom-client");

const app = express();
const register = new client.Registry();

client.collectDefaultMetrics({ register });

const httpRequests = new client.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests.",
  labelNames: ["method", "path", "status_code"],
  registers: [register],
});

const port = process.env.PORT || "3000";
const version = process.env.APP_VERSION || "dev";

app.get("/", (req, res) => {
  httpRequests.inc({ method: req.method, path: req.path, status_code: "200" });
  res.type("text/plain").send(`hello world\nversion=${version}\n`);
});

app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

app.listen(port, () => {
  console.log(`nodejs app listening on :${port}`);
});
