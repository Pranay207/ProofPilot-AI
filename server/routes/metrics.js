export function registerMetricsRoutes(app, { loadCases, buildMetricsResponse, buildEvaluationResponse }) {
  app.get("/api/metrics", async (_req, res, next) => {
    try {
      const cases = await loadCases();
      res.json(buildMetricsResponse(cases));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/evaluation", async (_req, res, next) => {
    try {
      const cases = await loadCases();
      res.json(buildEvaluationResponse(cases));
    } catch (error) {
      next(error);
    }
  });
}
