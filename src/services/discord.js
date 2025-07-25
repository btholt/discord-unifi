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
    const { eventType, cameraName, timestamp, description } = eventData;

    // Determine emoji and color based on event type
    const eventConfig = this.getEventConfig(eventType);

    const embed = {
      title: `Unifi Protect Alert`,
      description: description || `Event: ${eventType}`,
      color: eventConfig.color,
      timestamp: timestamp || new Date().toISOString(),
      fields: [],
    };

    // Add camera name if available
    if (cameraName) {
      embed.fields.push({
        name: "Camera",
        value: cameraName,
        inline: true,
      });
    }

    // Add event type
    embed.fields.push({
      name: "Event Type",
      value: eventType,
      inline: true,
    });

    // Add any additional fields from the event data
    if (eventData.location) {
      embed.fields.push({
        name: "Location",
        value: eventData.location,
        inline: true,
      });
    }

    return {
      content: `${eventConfig.emoji} **${eventConfig.title}**`,
      embeds: [embed],
    };
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
        eventType: eventData.eventType,
        cameraName: eventData.cameraName,
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
