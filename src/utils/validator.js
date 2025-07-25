/**
 * Validate incoming webhook request
 * @param {Object} body - Request body
 * @param {string} secret - Optional webhook secret for validation
 * @returns {Object} Validation result with isValid and errors
 */
function validateWebhookRequest(body, secret = null) {
  const errors = [];

  // Check if body exists and is an object
  if (!body || typeof body !== "object") {
    errors.push("Request body must be a valid JSON object");
    return { isValid: false, errors };
  }

  // Basic required fields check (adjust based on actual Unifi Protect payload)
  if (!body.timestamp) {
    errors.push("Missing required field: timestamp");
  }

  if (!body.eventType) {
    errors.push("Missing required field: eventType");
  }

  // Optional webhook secret validation
  if (secret && body.secret !== secret) {
    errors.push("Invalid webhook secret");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Sanitize data before forwarding to Discord
 * @param {Object} data - Raw webhook data
 * @returns {Object} Sanitized data
 */
function sanitizeData(data) {
  const sanitized = { ...data };

  // Remove sensitive fields
  delete sanitized.secret;
  delete sanitized.password;
  delete sanitized.token;

  // Sanitize string fields to prevent injection
  if (sanitized.cameraName) {
    sanitized.cameraName = String(sanitized.cameraName).substring(0, 100);
  }

  if (sanitized.description) {
    sanitized.description = String(sanitized.description).substring(0, 2000);
  }

  return sanitized;
}

/**
 * Generate a unique request ID
 * @returns {string} Unique request identifier
 */
function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

module.exports = {
  validateWebhookRequest,
  sanitizeData,
  generateRequestId,
};
