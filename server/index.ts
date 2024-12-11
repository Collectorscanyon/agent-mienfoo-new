import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import { NeynarAPIClient, Configuration } from '@neynar/nodejs-sdk';
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { config, PORT } from "./config";

// Initialize Neynar client with v2 configuration
const neynarConfig = new Configuration({
  apiKey: config.NEYNAR_API_KEY,
});

const neynar = new NeynarAPIClient(neynarConfig);

// Initialize Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Request logging middleware
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
  const server = registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  try {
    // ALWAYS serve the app on port from config (default 5000)
    const port = Number(PORT);
    server.listen(port, "0.0.0.0", () => {
      log(`🚀 Farcaster bot server running on port ${port}`);
      log(`🤖 Bot ready to handle mentions and commands`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
})().catch((error) => {
  console.error("Unhandled server error:", error);
  process.exit(1);
});
