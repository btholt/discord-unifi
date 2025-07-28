const axios = require("axios");
const FormData = require("form-data");
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
    const personInfo = this.extractPersonInfo(alarm);

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

    // Add person information if available (for face recognition)
    if (personInfo && personInfo.name) {
      embed.fields.push({
        name: "Person",
        value: personInfo.name,
        inline: true,
      });
    }

    // Add device information if available
    if (deviceInfo) {
      embed.fields.push({
        name: "Device",
        value: deviceInfo,
        inline: true,
      });
    }

    // Add event ID if available (for thumbnail fetching)
    if (personInfo && personInfo.eventId) {
      embed.fields.push({
        name: "Event ID",
        value: personInfo.eventId,
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
        if (source.includes("face_known")) return "face_known";
        if (source.includes("face_unknown")) return "face_unknown";
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
   * Extract person information from face recognition events
   * @param {Object} alarm - Alarm object from Unifi Protect
   * @returns {Object} Person information with name and event details
   */
  extractPersonInfo(alarm) {
    if (!alarm.triggers || !Array.isArray(alarm.triggers)) {
      return null;
    }

    for (const trigger of alarm.triggers) {
      // Check for face recognition events
      if (trigger.key === "face_known" || trigger.key === "face_unknown") {
        const personInfo = {
          name: null,
          eventId: trigger.eventId,
          eventLocalLink: alarm.eventLocalLink,
          eventPath: alarm.eventPath,
          timestamp: trigger.timestamp,
        };

        // Extract person name from group or value
        if (trigger.group && trigger.group.name) {
          personInfo.name = trigger.group.name;
        } else if (trigger.value) {
          personInfo.name = trigger.value;
        }

        return personInfo;
      }
    }

    return null;
  }

  /**
   * Extract event ID from any trigger
   * @param {Object} alarm - Alarm object from Unifi Protect
   * @returns {string|null} Event ID if found
   */
  extractEventId(alarm) {
    if (!alarm.triggers || !Array.isArray(alarm.triggers)) {
      return null;
    }

    for (const trigger of alarm.triggers) {
      if (trigger.eventId) {
        return trigger.eventId;
      }
    }

    return null;
  }

  /**
   * Fetch animated thumbnail from Unifi Protect
   * @param {string} eventId - Event ID
   * @param {string} requestId - Request ID for logging
   * @returns {Promise<Buffer|null>} Thumbnail buffer or null if failed
   */
  async fetchAnimatedThumbnail(eventId, requestId) {
    const requestLogger = this.logger.child({ requestId });
    const protectApiKey = process.env.PROTECT_API_KEY;
    const protectHost = process.env.PROTECT_HOST || "192.168.1.80";

    if (!protectApiKey) {
      requestLogger.info("No PROTECT_API_KEY configured, skipping thumbnail");
      return null;
    }

    if (!eventId) {
      requestLogger.warn("No event ID provided for thumbnail");
      return null;
    }

    try {
      const thumbnailUrl = `http://${protectHost}/proxy/protect/api/events/${eventId}/animated-thumbnail?keyFrameOnly=true&speedup=10`;

      requestLogger.info("Fetching animated thumbnail", {
        eventId,
        thumbnailUrl: thumbnailUrl.replace(protectApiKey, "[REDACTED]"),
      });

      const response = await axios.get(thumbnailUrl, {
        headers: {
          "X-API-KEY": protectApiKey,
        },
        responseType: "arraybuffer",
        timeout: 15000, // 15 second timeout
      });

      if (response.status === 200 && response.data) {
        requestLogger.info("Successfully fetched animated thumbnail", {
          eventId,
          size: response.data.length,
        });
        return Buffer.from(response.data);
      } else {
        requestLogger.warn("Failed to fetch thumbnail - invalid response", {
          eventId,
          status: response.status,
        });
        return null;
      }
    } catch (error) {
      requestLogger.error("Failed to fetch animated thumbnail", {
        eventId,
        error: error.message,
        statusCode: error.response?.status,
      });
      return null;
    }
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
      face_known: {
        emoji: "👤",
        title: "Known Person Detected",
        color: 3447003, // Blue
      },
      face_unknown: {
        emoji: "👤",
        title: "Unknown Person Detected",
        color: 16776960, // Yellow
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
   * Send message with thumbnail to Discord webhook
   * @param {Object} messageData - Message data to send
   * @param {Buffer|null} thumbnailBuffer - Thumbnail buffer to upload
   * @param {string} requestId - Request ID for logging
   * @returns {Promise<Object>} Discord API response
   */
  async sendMessageWithThumbnail(messageData, thumbnailBuffer, requestId) {
    const requestLogger = this.logger.child({ requestId });

    try {
      if (thumbnailBuffer) {
        requestLogger.info("Sending message with thumbnail to Discord", {
          webhookUrl: this.webhookUrl.substring(0, 50) + "...",
          messageType: messageData.content ? "with_content" : "embed_only",
          thumbnailSize: thumbnailBuffer.length,
        });

        // Create form data for file upload
        const formData = new FormData();
        formData.append("payload_json", JSON.stringify(messageData));
        formData.append("files[0]", thumbnailBuffer, {
          filename: "animated-thumbnail.gif",
          contentType: "image/gif",
        });

        const response = await axios.post(this.webhookUrl, formData, {
          headers: {
            ...formData.getHeaders(),
          },
          timeout: 15000, // 15 second timeout for file upload
        });

        requestLogger.info(
          "Message with thumbnail sent successfully to Discord",
          {
            statusCode: response.status,
            messageId: response.data?.id,
          }
        );

        return response.data;
      } else {
        // No thumbnail, send regular message
        return await this.sendMessage(messageData, requestId);
      }
    } catch (error) {
      requestLogger.error("Failed to send message with thumbnail to Discord", {
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
        personInfo: this.extractPersonInfo(eventData.alarm),
      });

      // Extract event ID for thumbnail
      const eventId = this.extractEventId(eventData.alarm);

      // Fetch animated thumbnail if API key is available
      let thumbnailBuffer = null;
      if (eventId) {
        thumbnailBuffer = await this.fetchAnimatedThumbnail(eventId, requestId);
      }

      const discordMessage = this.transformToDiscordFormat(eventData);
      const result = await this.sendMessageWithThumbnail(
        discordMessage,
        thumbnailBuffer,
        requestId
      );

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
