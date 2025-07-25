# Unifi Protect to Discord Webhook Bridge

## Project Overview

Create a lightweight Node.js server that receives webhook posts from Unifi Protect Alarm Manager and forwards them to a Discord webhook. The entire application should be containerized using Docker for easy deployment.

## Technical Requirements

### Core Functionality

- **HTTP Server**: Create an Express.js server that listens for incoming POST requests
- **Webhook Receiver**: Accept incoming webhooks from Unifi Protect on a configurable endpoint (e.g., `/webhook/unifi`)
- **Discord Integration**: Forward received webhook data to a Discord webhook URL
- **Error Handling**: Implement proper error handling and logging
- **Health Check**: Include a health check endpoint for container monitoring

### Configuration

- Use environment variables for all configuration:
  - `PORT` (default: 3000)
  - `DISCORD_WEBHOOK_URL` (required)
  - `WEBHOOK_PATH` (default: "/webhook/unifi")
  - `LOG_LEVEL` (default: "info")

### Data Processing

- Accept JSON payloads from Unifi Protect
- Transform the data into Discord-friendly format
- Handle different types of Unifi Protect events (motion detection, alerts, etc.)
- Include timestamp and formatted message content

### Security Considerations

- Validate incoming requests
- Rate limiting to prevent abuse
- Optional webhook secret validation
- Sanitize data before forwarding

## Docker Requirements

### Container Specifications

- Use official Node.js Alpine image for minimal size
- Non-root user execution
- Multi-stage build for optimization
- Health check configuration
- Proper signal handling for graceful shutdown

### Docker Compose

- Include docker-compose.yml for easy local development
- Environment variable template
- Volume mounting for logs (optional)
- Restart policies

## Project Structure

```
unifi-discord-bridge/
├── src/
│   ├── app.js              # Main application file
│   ├── routes/
│   │   └── webhook.js      # Webhook handling routes
│   ├── services/
│   │   └── discord.js      # Discord webhook service
│   └── utils/
│       ├── logger.js       # Logging configuration
│       └── validator.js    # Request validation
├── Dockerfile
├── docker-compose.yml
├── .dockerignore
├── .env.example
├── package.json
├── README.md
└── TASKS.md
```

## Development Guidelines

### Code Style

- Use ES6+ features
- Implement async/await for async operations
- Include JSDoc comments for functions
- Use consistent error handling patterns

### Logging

- Use structured logging (consider winston or pino)
- Include request IDs for tracing
- Log levels: error, warn, info, debug
- Log important events: server start, webhook received, Discord message sent

### Testing Considerations

- Include basic health check endpoint
- Consider adding request/response logging for debugging
- Validate environment variables on startup

## Deployment Notes

- Container should be stateless
- Use environment variables for all configuration
- Include proper shutdown handling
- Consider resource limits in production

## Example Discord Message Format

Transform Unifi Protect alerts into readable Discord messages:

```json
{
  "content": "🚨 **Motion Detected**",
  "embeds": [
    {
      "title": "Unifi Protect Alert",
      "description": "Motion detected on camera: Front Door",
      "color": 15158332,
      "timestamp": "2025-01-15T10:30:00.000Z",
      "fields": [
        {
          "name": "Camera",
          "value": "Front Door",
          "inline": true
        },
        {
          "name": "Event Type",
          "value": "Motion Detection",
          "inline": true
        }
      ]
    }
  ]
}
```

## Environment Variables Reference

- `PORT`: Server port (default: 3000)
- `DISCORD_WEBHOOK_URL`: Discord webhook URL (required)
- `WEBHOOK_PATH`: Endpoint path for Unifi webhooks (default: "/webhook/unifi")
- `LOG_LEVEL`: Logging level (default: "info")
- `WEBHOOK_SECRET`: Optional secret for webhook validation
- `RATE_LIMIT_WINDOW`: Rate limiting window in minutes (default: 15)
- `RATE_LIMIT_MAX`: Max requests per window (default: 100)
