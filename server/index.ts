import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { taskNotificationScheduler } from "./notificationScheduler";
import path from "path";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Environment validation and startup logging
  log("Starting FlowHub Command Center...");
  log(`Database: ${process.env.DATABASE_URL ? 'PostgreSQL' : 'Memory (development mode)'}`);
  log(`Gemini API: ${process.env.GEMINI_API_KEY ? 'configured' : 'not configured'}`);
  log(`Google OAuth: ${process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? 'configured' : 'not configured'}`);
  
  log(`Email Service: ${process.env.RESEND_API_KEY ? 'Resend configured ✅' : 'No Resend API key - notifications will be logged'}`);

  const server = await registerRoutes(app);

  // Start the task notification scheduler
  taskNotificationScheduler.start();

  // Add health endpoint BEFORE static file serving
  app.get("/health", (req, res) => {
    res.status(200).send("OK");
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Railway automatically sets the PORT environment variable
  const port = parseInt(process.env.PORT || '5000', 10);
  const host = '0.0.0.0'; // Use 0.0.0.0 for Replit compatibility
  
  server.listen(port, host, () => {
    log(`🚀 FlowHub serving on ${host}:${port}`);
    log(`📧 Task notification scheduler started`);
    log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    if (process.env.RAILWAY_STATIC_URL) {
      log(`🚂 Railway URL: https://${process.env.RAILWAY_STATIC_URL}`);
    }
  });
})();
