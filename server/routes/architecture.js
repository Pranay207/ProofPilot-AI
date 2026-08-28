import { buildArchitectureSummary } from "../services/architectureService.js";

export function registerArchitectureRoutes(app) {
  app.get("/api/architecture", (_req, res) => {
    res.json(buildArchitectureSummary());
  });
}

