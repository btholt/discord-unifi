const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
require("dotenv").config();

const { createLogger } = require("./utils/logger");
const DiscordService = require("./services/discord");
const webhookRoutes = require("./routes/webhook");

// Create logger instance
const logger = createLogger(process.env.LOG_LEVEL || "info");

// Validate required environment variables
const requiredEnvVars = ["DISCORD_WEBHOOK_URL"];
const missingEnvVars = requiredEnvVars.filter(
  (varName) => !process.env[varName]
);

if (missingEnvVars.length > 0) {
  logger.error("Missing required environment variables", {
    missing: missingEnvVars,
  });
  process.exit(1);
}

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;
const WEBHOOK_PATH = process.env.WEBHOOK_PATH || "/webhook/unifi";

// Security middleware
app.use(helmet());
app.use(cors());

// Body parsing middleware
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Trust proxy for accurate IP addresses
app.set("trust proxy", 1);

// Store services in app.locals for route access
app.locals.logger = logger;
app.locals.discordService = new DiscordService(process.env.DISCORD_WEBHOOK_URL);

// Request logging middleware
app.use((req, res, next) => {
  logger.info("Incoming request", {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get("User-Agent"),
  });
  next();
});

// Routes
app.use(WEBHOOK_PATH, webhookRoutes);

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    service: "Unifi Protect to Discord Bridge",
    version: process.env.npm_package_version || "1.0.0",
    status: "running",
    endpoints: {
      webhook: `${WEBHOOK_PATH}`,
      health: `${WEBHOOK_PATH}/health`,
    },
  });
});

// 404 handler
app.use("*", (req, res) => {
  logger.warn("Route not found", { path: req.originalUrl });
  res.status(404).json({
    error: "Not found",
    message: "The requested endpoint does not exist",
  });
});

// Global error handler
app.use((error, req, res, next) => {
  logger.error("Unhandled error", {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
  });

  res.status(500).json({
    error: "Internal server error",
    message: "An unexpected error occurred",
  });
});

// Graceful shutdown handling
const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}, starting graceful shutdown`);

  server.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
};

// Start server
const server = app.listen(PORT, () => {
  logger.info("Server started successfully", {
    port: PORT,
    webhookPath: WEBHOOK_PATH,
    nodeVersion: process.version,
    environment: process.env.NODE_ENV || "development",
  });
});

// Handle shutdown signals
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled rejection", { reason, promise });
  process.exit(1);
});

module.exports = app;
