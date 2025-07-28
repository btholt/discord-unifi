const axios = require("axios");
const { createLogger } = require("../utils/logger");

const logger = createLogger();

/**
 * Discord webhook service for sending messages
 */
class DiscordService {
  constructor(webhookUrl) {
    this.webhookUrl = webhookUrl;
    this.logger = logger.child({ service: "discord" });
  }

  /**
   * Transform Unifi Protect event into Discord embed format
   * @param {Object} eventData - Unifi Protect event data
   * @returns {Object} Discord message payload
   */
  transformToDiscordFormat(eventData) {
    const { alarm, timestamp } = eventData;

    // Extract event information from the alarm structure
    const alarmName = alarm.name || "Unknown Alarm";
    const eventType = this.extractEventType(alarm);
    const deviceInfo = this.extractDeviceInfo(alarm);

    // Convert timestamp to ISO string if it's a number
    const formattedTimestamp =
      typeof timestamp === "number"
        ? new Date(timestamp).toISOString()
        : timestamp || new Date().toISOString();

    // Determine emoji and color based on event type
    const eventConfig = this.getEventConfig(eventType);

    const embed = {
      title: `Unifi Protect Alert`,
      description: alarmName,
      color: eventConfig.color,
      timestamp: formattedTimestamp,
      fields: [],
    };

    // Add event type
    embed.fields.push({
      name: "Event Type",
      value: eventType,
      inline: true,
    });

    // Add device information if available
    if (deviceInfo) {
      embed.fields.push({
        name: "Device",
        value: deviceInfo,
        inline: true,
      });
    }

    // Add condition information if available
    if (alarm.conditions && alarm.conditions.length > 0) {
      const conditions = alarm.conditions
        .map((cond) =>
          cond.condition
            ? `${cond.condition.source || "unknown"} (${
                cond.condition.type || "unknown"
              })`
            : "unknown"
        )
        .join(", ");

      embed.fields.push({
        name: "Conditions",
        value: conditions,
        inline: false,
      });
    }

    return {
      content: `${eventConfig.emoji} **${eventConfig.title}**`,
      embeds: [embed],
    };
  }

  /**
   * Extract event type from alarm conditions
   * @param {Object} alarm - Alarm object from Unifi Protect
   * @returns {string} Event type
   */
  extractEventType(alarm) {
    if (!alarm.conditions || !Array.isArray(alarm.conditions)) {
      return "unknown";
    }

    // Look for motion detection in conditions
    for (const condition of alarm.conditions) {
      if (condition.condition && condition.condition.source) {
        const source = condition.condition.source.toLowerCase();
        if (source.includes("motion")) return "motion";
        if (source.includes("person")) return "person";
        if (source.includes("vehicle")) return "vehicle";
        if (source.includes("package")) return "package";
        if (source.includes("alert")) return "alert";
      }
    }

    // Fallback to first condition source or 'unknown'
    const firstCondition = alarm.conditions[0];
    if (
      firstCondition &&
      firstCondition.condition &&
      firstCondition.condition.source
    ) {
      return firstCondition.condition.source.toLowerCase();
    }

    return "unknown";
  }

  /**
   * Extract device information from alarm triggers
   * @param {Object} alarm - Alarm object from Unifi Protect
   * @returns {string} Device information
   */
  extractDeviceInfo(alarm) {
    if (!alarm.triggers || !Array.isArray(alarm.triggers)) {
      return null;
    }

    const deviceInfo = [];

    for (const trigger of alarm.triggers) {
      if (trigger.device) {
        deviceInfo.push(`Device: ${trigger.device}`);
      }
      if (trigger.key) {
        deviceInfo.push(`Trigger: ${trigger.key}`);
      }
    }

    return deviceInfo.length > 0 ? deviceInfo.join(" | ") : null;
  }

  /**
   * Get event configuration based on event type
   * @param {string} eventType - Type of Unifi Protect event
   * @returns {Object} Event configuration with emoji, title, and color
   */
  getEventConfig(eventType) {
    const configs = {
      motion: {
        emoji: "🚨",
        title: "Motion Detected",
        color: 15158332, // Red
      },
      alert: {
        emoji: "⚠️",
        title: "Alert Triggered",
        color: 16776960, // Yellow
      },
      person: {
        emoji: "👤",
        title: "Person Detected",
        color: 3447003, // Blue
      },
      vehicle: {
        emoji: "🚗",
        title: "Vehicle Detected",
        color: 7419530, // Cyan
      },
      package: {
        emoji: "📦",
        title: "Package Detected",
        color: 5763719, // Green
      },
    };

    return (
      configs[eventType.toLowerCase()] || {
        emoji: "🔔",
        title: "Event Detected",
        color: 10181046, // Purple
      }
    );
  }

  /**
   * Send message to Discord webhook
   * @param {Object} messageData - Message data to send
   * @param {string} requestId - Request ID for logging
   * @returns {Promise<Object>} Discord API response
   */
  async sendMessage(messageData, requestId) {
    const requestLogger = this.logger.child({ requestId });

    try {
      requestLogger.info("Sending message to Discord", {
        webhookUrl: this.webhookUrl.substring(0, 50) + "...",
        messageType: messageData.content ? "with_content" : "embed_only",
      });

      const response = await axios.post(this.webhookUrl, messageData, {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 10000, // 10 second timeout
      });

      requestLogger.info("Message sent successfully to Discord", {
        statusCode: response.status,
        messageId: response.data?.id,
      });

      return response.data;
    } catch (error) {
      requestLogger.error("Failed to send message to Discord", {
        error: error.message,
        statusCode: error.response?.status,
        responseData: error.response?.data,
      });

      throw new Error(`Discord webhook failed: ${error.message}`);
    }
  }

  /**
   * Process Unifi Protect event and send to Discord
   * @param {Object} eventData - Unifi Protect event data
   * @param {string} requestId - Request ID for logging
   * @returns {Promise<Object>} Discord API response
   */
  async processAndSend(eventData, requestId) {
    const requestLogger = this.logger.child({ requestId });

    try {
      requestLogger.info("Processing Unifi Protect event", {
        alarmName: eventData.alarm?.name,
        eventType: this.extractEventType(eventData.alarm),
        deviceCount: eventData.alarm?.triggers?.length || 0,
      });

      // Log the extracted data for debugging
      requestLogger.info("Extracted event data", {
        alarm: eventData.alarm,
        timestamp: eventData.timestamp,
        extractedEventType: this.extractEventType(eventData.alarm),
        deviceInfo: this.extractDeviceInfo(eventData.alarm),
      });

      const discordMessage = this.transformToDiscordFormat(eventData);
      const result = await this.sendMessage(discordMessage, requestId);

      requestLogger.info("Event processed and sent successfully");
      return result;
    } catch (error) {
      requestLogger.error("Failed to process and send event", {
        error: error.message,
        eventData: eventData,
      });
      throw error;
    }
  }
}

module.exports = DiscordService;
