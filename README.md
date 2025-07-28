# Unifi Protect to Discord Webhook Bridge

A lightweight Node.js server that receives webhook posts from Unifi Protect Alarm Manager and forwards them to a Discord webhook. The entire application is containerized using Docker for easy deployment.

## Features

- 🚨 **Real-time Alerts**: Receive and forward Unifi Protect events to Discord
- 🔒 **Security**: Rate limiting, request validation, and data sanitization
- 📊 **Structured Logging**: Comprehensive logging with request tracing
- 🐳 **Docker Ready**: Complete containerization with health checks
- ⚡ **Lightweight**: Optimized for minimal resource usage
- 🔧 **Configurable**: Environment-based configuration

## Quick Start

### Option 1: Using Published Docker Image (Recommended)

The latest Docker image is automatically published to GitHub Container Registry on each release.

```bash
# Pull the latest image
docker pull ghcr.io/btholt/discord-unifi:latest

# Run with environment variables
docker run -d \
  --name unifi-discord-bridge \
  -p 3000:3000 \
  -e DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/YOUR_WEBHOOK_URL_HERE" \
  ghcr.io/btholt/discord-unifi:latest
```

### Option 2: Local Development

#### Prerequisites

- Docker and Docker Compose
- Discord webhook URL
- Unifi Protect system with webhook capability

#### 1. Clone and Setup

```bash
git clone <repository-url>
cd unifi-discord-bridge
cp env.example .env
```

#### 2. Configure Environment

Edit `.env` file with your Discord webhook URL:

```bash
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_WEBHOOK_URL_HERE
```

#### 3. Run with Docker Compose

```bash
docker-compose up -d
```

The service will be available at `http://localhost:3000`

## Configuration

### Environment Variables

| Variable              | Default          | Description                              |
| --------------------- | ---------------- | ---------------------------------------- |
| `PORT`                | `3000`           | Server port                              |
| `DISCORD_WEBHOOK_URL` | **Required**     | Discord webhook URL                      |
| `WEBHOOK_PATH`        | `/webhook/unifi` | Endpoint path for Unifi webhooks         |
| `LOG_LEVEL`           | `info`           | Logging level (error, warn, info, debug) |
| `WEBHOOK_SECRET`      | -                | Optional secret for webhook validation   |
| `RATE_LIMIT_WINDOW`   | `15`             | Rate limiting window in minutes          |
| `RATE_LIMIT_MAX`      | `100`            | Max requests per window                  |

### Discord Webhook Setup

1. Go to your Discord server settings
2. Navigate to Integrations → Webhooks
3. Create a new webhook
4. Copy the webhook URL
5. Set it as `DISCORD_WEBHOOK_URL` in your environment

## API Endpoints

### Webhook Endpoint

- **POST** `/webhook/unifi` - Receive Unifi Protect webhooks
- **GET** `/webhook/unifi/health` - Health check endpoint

### Root Endpoint

- **GET** `/` - Service information

## Unifi Protect Webhook Format

The service expects JSON payloads from Unifi Protect with the following structure:

```json
{
  "alarm": {
    "name": "Motion Detected",
    "sources": [],
    "conditions": [
      {
        "condition": {
          "type": "is",
          "source": "motion"
        }
      }
    ],
    "triggers": [
      {
        "key": "motion",
        "device": "74ACB99F4E24"
      }
    ]
  },
  "timestamp": 1722526793954
}
```

### Supported Event Types

The service automatically detects event types from the `alarm.conditions[].condition.source` field:

- `motion` - Motion detection events
- `alert` - General alerts
- `person` - Person detection
- `vehicle` - Vehicle detection
- `package` - Package detection
- `unknown` - Fallback for unrecognized event types

## Discord Message Format

Events are transformed into rich Discord embeds with:

- Event-specific emojis and colors
- Camera information
- Timestamps
- Structured fields

Example Discord message:

```
🚨 **Motion Detected**

Unifi Protect Alert
Motion detected on camera: Front Door
Camera: Front Door | Event Type: Motion Detection
```

## Development

### Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

### Building Docker Image

```bash
# Build image
docker build -t unifi-discord-bridge .

# Run container
docker run -p 3000:3000 -e DISCORD_WEBHOOK_URL=your_url unifi-discord-bridge
```

## Logging

The application uses structured logging with Winston. Log levels:

- `error` - Application errors
- `warn` - Warning messages
- `info` - General information
- `debug` - Detailed debugging information

Each request gets a unique request ID for tracing.

## Security Features

- **Rate Limiting**: Prevents abuse with configurable limits
- **Request Validation**: Validates incoming webhook data
- **Data Sanitization**: Removes sensitive information
- **Helmet**: Security headers
- **CORS**: Cross-origin resource sharing protection
- **Non-root User**: Docker container runs as non-root user

## Health Checks

The application includes health check endpoints for container orchestration:

```bash
curl http://localhost:3000/webhook/unifi/health
```

Response:

```json
{
  "status": "healthy",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "service": "unifi-discord-bridge",
  "version": "1.0.0"
}
```

## Troubleshooting

### Common Issues

1. **Discord webhook not working**

   - Verify the webhook URL is correct
   - Check Discord server permissions
   - Ensure the webhook is not disabled

2. **Rate limiting errors**

   - Adjust `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW` values
   - Check if multiple instances are running

3. **Container health check failing**
   - Verify the service is running on the correct port
   - Check container logs for errors

### Logs

View application logs:

```bash
# Docker Compose
docker-compose logs -f

# Docker container
docker logs unifi-discord-bridge
```

## GitHub Actions & Releases

This project uses GitHub Actions for automated CI/CD:

### 🚀 Automated Releases

When you create a new release tag (e.g., `v1.0.1`), the workflow will:

1. **Build Docker Image** - Multi-platform build (AMD64, ARM64)
2. **Push to GHCR** - Publish to GitHub Container Registry
3. **Create Release** - Generate release notes with usage instructions
4. **Security Scan** - Run vulnerability scanning with Trivy

### 📋 Creating a Release

```bash
# Create and push a new tag
git tag v1.0.1
git push origin v1.0.1
```

Or use the GitHub UI to create a release.

### 🔄 CI/CD Pipeline

- **Pull Requests**: Build and test on every PR
- **Main Branch**: Build and push to GHCR on every push
- **Security**: Automated vulnerability scanning
- **Testing**: Docker image validation

## Deployment

### Production Deployment

#### Option 1: Using Published Image (Recommended)

```bash
# Pull the latest release
docker pull ghcr.io/btholt/discord-unifi:latest

# Run in production
docker run -d \
  --name unifi-discord-bridge \
  --restart unless-stopped \
  -p 3000:3000 \
  -e DISCORD_WEBHOOK_URL="your_discord_webhook_url" \
  -e LOG_LEVEL="info" \
  ghcr.io/btholt/discord-unifi:latest
```

#### Option 2: Local Build

1. **Environment Setup**

   ```bash
   cp env.example .env
   # Edit .env with production values
   ```

2. **Docker Compose**

   ```bash
   docker-compose -f docker-compose.yml up -d
   ```

3. **Reverse Proxy** (Optional)
   Configure nginx or similar to proxy requests to the container.

### Resource Limits

For production deployments, consider setting resource limits:

```yaml
services:
  unifi-discord-bridge:
    deploy:
      resources:
        limits:
          memory: 256M
          cpus: "0.5"
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:

- Check the troubleshooting section
- Review application logs
- Open an issue on GitHub
