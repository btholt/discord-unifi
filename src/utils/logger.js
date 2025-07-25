const winston = require("winston");

/**
 * Configure and create Winston logger instance
 * @param {string} level - Log level (error, warn, info, debug)
 * @returns {winston.Logger} Configured logger instance
 */
function createLogger(level = "info") {
  const logger = winston.createLogger({
    level: level,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    ),
    defaultMeta: { service: "unifi-discord-bridge" },
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        ),
      }),
    ],
  });

  return logger;
}

/**
 * Create a child logger with request ID for tracing
 * @param {winston.Logger} logger - Parent logger instance
 * @param {string} requestId - Unique request identifier
 * @returns {winston.Logger} Child logger with request ID
 */
function createRequestLogger(logger, requestId) {
  return logger.child({ requestId });
}

module.exports = {
  createLogger,
  createRequestLogger,
};
