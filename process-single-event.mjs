import axios from "axios";
import https from "https";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import FormData from "form-data";
dotenv.config();

class SingleEventProcessor {
  constructor() {
    this.host = process.env.PROTECT_HOST || "192.168.1.80";
    this.username = process.env.PROTECT_USERNAME;
    this.password = process.env.PROTECT_PASSWORD;
    this.discordWebhook = process.env.DISCORD_WEBHOOK_URL;
    this.sessionToken = null;

    if (!this.username || !this.password) {
      throw new Error(
        "Missing PROTECT_USERNAME or PROTECT_PASSWORD in .env file"
      );
    }

    if (!this.discordWebhook) {
      throw new Error("Missing DISCORD_WEBHOOK_URL in .env file");
    }

    this.client = axios.create({
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      timeout: 30000,
      maxRedirects: 5,
      withCredentials: true,
    });
  }

  async authenticate() {
    console.log("🔐 Authenticating with UniFi Protect...");

    try {
      const loginResponse = await this.client.post(
        `https://${this.host}/api/auth/login`,
        {
          username: this.username,
          password: this.password,
          remember: true,
        },
        {
          headers: {
            "Content-Type": "application/json",
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
          },
        }
      );

      // Extract session token from cookies
      const cookies = loginResponse.headers["set-cookie"];
      if (cookies) {
        for (const cookie of cookies) {
          if (cookie.includes("TOKEN=")) {
            this.sessionToken = cookie.split("TOKEN=")[1].split(";")[0];
            break;
          }
        }
      }

      if (!this.sessionToken) {
        throw new Error("No session token found in response");
      }

      // Save to cookies file
      const expiry = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
      const cookieLine = `${this.host}\tTRUE\t/proxy/protect/\tTRUE\t${expiry}\tTOKEN\t${this.sessionToken}`;
      fs.writeFileSync("cookies.txt", cookieLine);

      return true;
    } catch (error) {
      console.log("❌ Authentication failed:", error.message);
      return false;
    }
  }

  async loadExistingSession() {
    if (!fs.existsSync("cookies.txt")) {
      return false;
    }

    try {
      const cookieContent = fs.readFileSync("cookies.txt", "utf8");
      const tokenMatch = cookieContent.match(/TOKEN\t([^\t\n]+)/);
      if (tokenMatch) {
        this.sessionToken = tokenMatch[1];
        return true;
      }
    } catch (error) {
      console.log("❌ Error loading existing session:", error.message);
    }

    return false;
  }

  async ensureAuthenticated() {
    // Try to load existing session first
    if (await this.loadExistingSession()) {
      // Test if the session is still valid
      try {
        await this.client.get(`https://${this.host}/api/auth/me`, {
          headers: {
            Cookie: `TOKEN=${this.sessionToken}`,
          },
        });
        return true;
      } catch (error) {
        console.log("❌ Session expired, re-authenticating...");
      }
    }

    // Authenticate if no valid session
    return await this.authenticate();
  }

  async getEventInfo(eventId) {
    console.log(`📋 Fetching event info for: ${eventId}`);

    try {
      const response = await this.client.get(
        `https://${this.host}/proxy/protect/api/events/${eventId}`,
        {
          headers: {
            accept: "application/json",
            "user-agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
            Cookie: `TOKEN=${this.sessionToken}`,
          },
        }
      );

      if (response.status === 200 && response.data) {
        console.log("✅ Event info retrieved");
        return response.data;
      } else {
        console.log("❌ Unexpected response format");
        return null;
      }
    } catch (error) {
      console.log("❌ Error fetching event info:");
      console.log("Error:", error.message);
      if (error.response) {
        console.log("Status:", error.response.status);
      }
      return null;
    }
  }

  async downloadThumbnail(eventId, outputFile) {
    console.log(`📸 Downloading thumbnail for event: ${eventId}`);

    try {
      const url = `https://${this.host}/proxy/protect/api/events/${eventId}/thumbnail`;

      const response = await this.client.get(url, {
        headers: {
          accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
          "accept-language": "en-US,en;q=0.9",
          "cache-control": "no-cache",
          pragma: "no-cache",
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
          Cookie: `TOKEN=${this.sessionToken}`,
        },
        responseType: "arraybuffer",
      });

      if (response.status === 200) {
        fs.writeFileSync(outputFile, response.data);
        console.log(
          `✅ Thumbnail saved as ${outputFile} (${response.data.length} bytes)`
        );
        return true;
      } else {
        console.log(`❌ Unexpected status: ${response.status}`);
        return false;
      }
    } catch (error) {
      console.log("❌ Download failed:");
      console.log("Error:", error.message);
      if (error.response) {
        console.log("Status:", error.response.status);
      }
      return false;
    }
  }

  async uploadToDiscord(filePath, eventInfo) {
    console.log(`📤 Uploading to Discord: ${path.basename(filePath)}`);

    try {
      const formData = new FormData();
      formData.append("file", fs.createReadStream(filePath), {
        filename: path.basename(filePath),
        contentType: "image/jpeg",
      });

      // Add event information as content
      const content = this.formatEventInfo(eventInfo);
      if (content) {
        formData.append("content", content);
      }

      const response = await axios.post(this.discordWebhook, formData, {
        headers: formData.getHeaders(),
        timeout: 30000,
      });

      if (response.status === 204 || response.status === 200) {
        console.log("✅ Successfully uploaded to Discord");
        return true;
      } else {
        console.log(`❌ Unexpected Discord response: ${response.status}`);
        return false;
      }
    } catch (error) {
      console.log("❌ Discord upload failed:");
      console.log("Error:", error.message);
      if (error.response) {
        console.log("Status:", error.response.status);
        console.log("Response:", error.response.data);
      }
      return false;
    }
  }

  formatEventInfo(event) {
    if (!event) return null;

    const timestamp = new Date(event.start * 1000).toLocaleString();
    const cameraName = event.camera?.name || "Unknown Camera";
    const eventType = event.type || "Unknown Event";

    return `📹 **${eventType}** on ${cameraName}\n🕐 ${timestamp}`;
  }

  async processEvent(eventId) {
    const fileName = `thumbnail-${eventId}.jpg`;

    try {
      // Get event info
      const eventInfo = await this.getEventInfo(eventId);
      if (!eventInfo) {
        console.log(`❌ Could not get event info for ${eventId}`);
        return false;
      }

      // Download thumbnail
      const downloadSuccess = await this.downloadThumbnail(eventId, fileName);
      if (!downloadSuccess) {
        console.log(`❌ Failed to download thumbnail for event ${eventId}`);
        return false;
      }

      // Upload to Discord
      const uploadSuccess = await this.uploadToDiscord(fileName, eventInfo);
      if (!uploadSuccess) {
        console.log(`❌ Failed to upload thumbnail for event ${eventId}`);
        return false;
      }

      // Clean up local file
      try {
        fs.unlinkSync(fileName);
        console.log(`🗑️ Cleaned up ${fileName}`);
      } catch (error) {
        console.log(`⚠️ Warning: Could not delete ${fileName}:`, error.message);
      }

      return true;
    } catch (error) {
      console.log(`❌ Error processing event ${eventId}:`, error.message);
      return false;
    }
  }

  async run(eventId) {
    console.log("=== UniFi Protect Single Event Processor ===");
    console.log(`Event ID: ${eventId}`);

    try {
      // Ensure we have a valid session
      const authSuccess = await this.ensureAuthenticated();
      if (!authSuccess) {
        console.log("❌ Failed to authenticate");
        return;
      }

      // Process the event
      console.log(`\n🔄 Processing event: ${eventId}`);
      const success = await this.processEvent(eventId);

      if (success) {
        console.log(`\n🎉 Successfully processed event: ${eventId}`);
      } else {
        console.log(`\n❌ Failed to process event: ${eventId}`);
      }
    } catch (error) {
      console.log("❌ Fatal error:", error.message);
    }
  }
}

// Main execution
const main = async () => {
  const eventId = process.argv[2];

  if (!eventId) {
    console.log("Usage: node process-single-event.mjs <event_id>");
    console.log(
      "Example: node process-single-event.mjs 68879cdf01481003e43bd176"
    );
    return;
  }

  try {
    const processor = new SingleEventProcessor();
    await processor.run(eventId);
  } catch (error) {
    console.log("❌ Initialization error:", error.message);
    console.log("Please check your .env file configuration");
  }
};

main();
