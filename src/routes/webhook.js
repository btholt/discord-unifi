const express = require("express");
const rateLimit = require("express-rate-limit");
const {
  validateWebhookRequest,
  sanitizeData,
  generateRequestId,
} = require("../utils/validator");
const { createRequestLogger } = require("../utils/logger");
const DiscordService = require("../services/discord");

const router = express.Router();

/**
 * Rate limiting middleware
 */
const webhookRateLimit = rateLimit({
  windowMs: (process.env.RATE_LIMIT_WINDOW || 15) * 60 * 1000, // 15 minutes default
  max: process.env.RATE_LIMIT_MAX || 100, // limit each IP to 100 requests per windowMs
  message: {
    error: "Too many requests from this IP, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Request ID middleware
 */
const requestIdMiddleware = (req, res, next) => {
  req.requestId = generateRequestId();
  next();
};

/**
 * Request logging middleware
 */
const requestLoggingMiddleware = (req, res, next) => {
  const logger = createRequestLogger(req.app.locals.logger, req.requestId);

  logger.info("Incoming webhook request", {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get("User-Agent"),
    contentType: req.get("Content-Type"),
  });

  next();
};

/**
 * Webhook endpoint for Unifi Protect
 * POST /webhook/unifi
 */
router.post(
  "/",
  webhookRateLimit,
  requestIdMiddleware,
  requestLoggingMiddleware,
  async (req, res) => {
    const logger = createRequestLogger(req.app.locals.logger, req.requestId);
    const discordService = req.app.locals.discordService;

    try {
      logger.info("Processing webhook request");

      // Log key webhook fields for debugging
      logger.info("Webhook structure", {
        bodyKeys: Object.keys(req.body || {}),
        alarmKeys: req.body.alarm ? Object.keys(req.body.alarm) : [],
        conditionsCount: req.body.alarm?.conditions?.length || 0,
        triggersCount: req.body.alarm?.triggers?.length || 0,
        hasAlarmId: req.body.alarm?.id !== undefined,
        hasEventId: req.body.eventId !== undefined,
        hasId: req.body.id !== undefined,
        // Check for potential ID fields in triggers
        triggerIds:
          req.body.alarm?.triggers?.map((t) => ({
            device: t.device,
            key: t.key,
            id: t.id,
          })) || [],
        // Check for potential ID fields in conditions
        conditionIds:
          req.body.alarm?.conditions?.map((c) => ({
            id: c.id,
            conditionId: c.condition?.id,
          })) || [],
      });

      // Log the entire webhook payload for debugging
      if (process.env.DEBUG_WEBHOOK === "true") {
        logger.info("Full webhook payload (DEBUG)", {
          body: JSON.stringify(req.body, null, 2),
          bodyType: typeof req.body,
          bodyKeys: Object.keys(req.body || {}),
          alarmKeys: req.body.alarm ? Object.keys(req.body.alarm) : [],
          conditionsCount: req.body.alarm?.conditions?.length || 0,
          triggersCount: req.body.alarm?.triggers?.length || 0,
        });
      }

      // Validate request body
      const validation = validateWebhookRequest(
        req.body,
        process.env.WEBHOOK_SECRET
      );

      if (!validation.isValid) {
        logger.warn("Invalid webhook request", { errors: validation.errors });
        return res.status(400).json({
          error: "Invalid request",
          details: validation.errors,
        });
      }

      // Sanitize the data
      const sanitizedData = sanitizeData(req.body);

      logger.info("Webhook data validated and sanitized", {
        alarmName: sanitizedData.alarm?.name,
        eventType: sanitizedData.alarm?.conditions?.[0]?.condition?.source,
        deviceCount: sanitizedData.alarm?.triggers?.length || 0,
      });

      // Process and send to Discord
      const result = await discordService.processAndSend(
        sanitizedData,
        req.requestId
      );

      logger.info("Webhook processed successfully");

      res.status(200).json({
        success: true,
        message: "Webhook processed successfully",
        discordMessageId: result.id,
      });
    } catch (error) {
      logger.error("Error processing webhook", {
        error: error.message,
        stack: error.stack,
      });

      res.status(500).json({
        error: "Internal server error",
        message: "Failed to process webhook",
      });
    }
  }
);

/**
 * Health check endpoint
 * GET /webhook/health
 */
router.get("/health", (req, res) => {
  const logger = createRequestLogger(
    req.app.locals.logger,
    req.requestId || "health_check"
  );

  logger.info("Health check requested");

  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "unifi-discord-bridge",
    version: process.env.npm_package_version || "1.0.0",
  });
});

module.exports = router;
