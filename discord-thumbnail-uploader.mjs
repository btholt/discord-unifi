import axios from "axios";
import https from "https";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import FormData from "form-data";
dotenv.config();

class UniFiDiscordUploader {
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

  async getEvents() {
    try {
      const response = await this.client.get(
        `https://${this.host}/proxy/protect/api/events`,
        {
          headers: {
            accept: "application/json",
            "user-agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
            Cookie: `TOKEN=${this.sessionToken}`,
          },
          params: {
            limit: 100,
            start: Math.floor(Date.now() / 1000) - 24 * 60 * 60, // Last 24 hours
          },
        }
      );

      if (response.status === 200 && response.data) {
        const events = Array.isArray(response.data)
          ? response.data
          : response.data.data;
        if (events && Array.isArray(events)) {
          // Filter for events that are likely to have thumbnails
          const eventsWithThumbnails = events.filter((event) => {
            const hasCamera = !!event.camera;
            const eventType = event.type;
            const thumbnailEventTypes = [
              "motion",
              "smartAudioDetect",
              "smartDetectZone",
              "smartDetectLine",
              "smartDetectObject",
            ];
            return hasCamera && thumbnailEventTypes.includes(eventType);
          });

          console.log(
            `📋 Found ${eventsWithThumbnails.length} events with thumbnails`
          );
          return eventsWithThumbnails;
        }
      }
      return [];
    } catch (error) {
      console.log("❌ Error fetching events:", error.message);
      return [];
    }
  }

  async downloadThumbnail(eventId, outputFile) {
    try {
      const url = `https://${this.host}/proxy/protect/api/events/${eventId}/thumbnail`;

      const response = await this.client.get(url, {
        headers: {
          accept: "image/*",
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
          Cookie: `TOKEN=${this.sessionToken}`,
        },
        responseType: "arraybuffer",
      });

      if (response.status === 200) {
        fs.writeFileSync(outputFile, response.data);
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  async uploadToDiscord(filePath, eventInfo) {
    try {
      const formData = new FormData();
      formData.append("file", fs.createReadStream(filePath), {
        filename: path.basename(filePath),
        contentType: "image/jpeg",
      });

      const content = this.formatEventInfo(eventInfo);
      if (content) {
        formData.append("content", content);
      }

      const response = await axios.post(this.discordWebhook, formData, {
        headers: formData.getHeaders(),
        timeout: 30000,
      });

      return response.status === 204 || response.status === 200;
    } catch (error) {
      console.log("❌ Discord upload failed:", error.message);
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

  async processEvent(event) {
    const eventId = event.id;
    const fileName = `thumbnail-${eventId}.jpg`;

    try {
      // Download thumbnail
      const downloadSuccess = await this.downloadThumbnail(eventId, fileName);
      if (!downloadSuccess) {
        return false;
      }

      // Upload to Discord
      const uploadSuccess = await this.uploadToDiscord(fileName, event);
      if (!uploadSuccess) {
        return false;
      }

      // Clean up local file
      try {
        fs.unlinkSync(fileName);
      } catch (error) {
        // Ignore cleanup errors
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  async run() {
    // Ensure we have a valid session
    const authenticated = await this.ensureAuthenticated();
    if (!authenticated) {
      console.log("❌ Failed to authenticate with UniFi Protect");
      return;
    }

    // Get events
    const events = await this.getEvents();
    if (events.length === 0) {
      console.log("📭 No events found to process");
      return;
    }

    console.log(`🔄 Processing ${events.length} events...`);

    let successCount = 0;
    let failureCount = 0;

    for (const event of events) {
      const success = await this.processEvent(event);
      if (success) {
        successCount++;
      } else {
        failureCount++;
      }

      // Add a small delay between events
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    console.log(
      `✅ Complete: ${successCount} successful, ${failureCount} failed`
    );
  }
}

// Main execution
const main = async () => {
  try {
    const uploader = new UniFiDiscordUploader();
    await uploader.run();
  } catch (error) {
    console.log("❌ Initialization error:", error.message);
    console.log("Please check your .env file configuration");
  }
};

main();
