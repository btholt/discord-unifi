import axios from "axios";
import https from "https";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config();

const authenticate = async () => {
  const host = process.env.PROTECT_HOST || "192.168.1.80";
  const username = process.env.PROTECT_USERNAME;
  const password = process.env.PROTECT_PASSWORD;

  if (!username || !password) {
    console.log("❌ Missing credentials!");
    console.log(
      "Please set PROTECT_USERNAME and PROTECT_PASSWORD in your .env file"
    );
    return null;
  }

  console.log("🔐 Authenticating with UniFi Protect...");

  try {
    const client = axios.create({
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      timeout: 10000,
      maxRedirects: 5,
      withCredentials: true,
    });

    // Get login page and extract CSRF token
    console.log("📄 Getting login page...");
    const loginPageResponse = await client.get(`https://${host}/`);
    const loginPageHtml = loginPageResponse.data;

    const csrfMatch = loginPageHtml.match(/name="csrfToken"\s+value="([^"]+)"/);
    if (!csrfMatch) {
      console.log("❌ Could not find CSRF token on login page");
      return null;
    }
    const csrfToken = csrfMatch[1];
    console.log("✅ Found CSRF token");

    // Perform login
    console.log("🔑 Attempting login...");
    const loginResponse = await client.post(
      `https://${host}/api/auth/login`,
      {
        username: username,
        password: password,
        remember: true,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
        },
      }
    );

    // Extract session token
    const cookies = loginResponse.headers["set-cookie"];
    if (!cookies) {
      console.log("❌ No cookies received from login");
      return null;
    }

    let sessionToken = null;
    for (const cookie of cookies) {
      if (cookie.includes("TOKEN=")) {
        sessionToken = cookie.split("TOKEN=")[1].split(";")[0];
        break;
      }
    }

    if (!sessionToken) {
      console.log("❌ Could not find session token in cookies");
      return null;
    }

    console.log("✅ Authentication successful!");

    // Save to cookies file
    const expiry = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
    const cookieLine = `${host}\tTRUE\t/proxy/protect/\tTRUE\t${expiry}\tTOKEN\t${sessionToken}`;
    fs.writeFileSync("cookies.txt", cookieLine);
    console.log("💾 Session token saved to cookies.txt");

    return sessionToken;
  } catch (error) {
    console.log("❌ Authentication failed:");
    console.log("Error:", error.message);
    if (error.response) {
      console.log("Status:", error.response.status);
    }
    return null;
  }
};

const downloadThumbnail = async (
  eventId,
  outputFile = "animated-thumbnail.gif"
) => {
  const host = process.env.PROTECT_HOST || "192.168.1.80";

  // Check if we have a valid session token
  let sessionToken = null;
  if (fs.existsSync("cookies.txt")) {
    const cookieContent = fs.readFileSync("cookies.txt", "utf8");
    const tokenMatch = cookieContent.match(/TOKEN\t([^\t\n]+)/);
    if (tokenMatch) {
      sessionToken = tokenMatch[1];
    }
  }

  // If no valid session, authenticate first
  if (!sessionToken) {
    sessionToken = await authenticate();
    if (!sessionToken) {
      console.log("❌ Failed to authenticate");
      return false;
    }
  }

  console.log(`📸 Downloading thumbnail for event: ${eventId}`);

  try {
    const client = axios.create({
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      timeout: 30000,
      responseType: "arraybuffer",
    });

    const url = `https://${host}/proxy/protect/api/events/${eventId}/animated-thumbnail?keyFrameOnly=true&speedup=10`;

    const response = await client.get(url, {
      headers: {
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "accept-language": "en-US,en;q=0.9",
        "cache-control": "no-cache",
        pragma: "no-cache",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
        Cookie: `TOKEN=${sessionToken}`,
      },
    });

    if (response.status === 200) {
      fs.writeFileSync(outputFile, response.data);
      console.log(`✅ Thumbnail saved as ${outputFile}`);
      console.log(`📊 File size: ${response.data.length} bytes`);
      console.log(`📋 Content-Type: ${response.headers["content-type"]}`);
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
};

// Main execution
const main = async () => {
  const eventId = process.argv[2];
  const outputFile = process.argv[3] || "animated-thumbnail.gif";

  if (!eventId) {
    console.log("Usage: node download-thumbnail.mjs <event_id> [output_file]");
    console.log(
      "Example: node download-thumbnail.mjs 68879cdf01481003e43bd176 my-thumbnail.gif"
    );
    return;
  }

  console.log("=== UniFi Protect Thumbnail Downloader ===");
  const success = await downloadThumbnail(eventId, outputFile);

  if (success) {
    console.log("\n🎉 Download completed successfully!");
  } else {
    console.log("\n❌ Download failed!");
  }
};

main();
