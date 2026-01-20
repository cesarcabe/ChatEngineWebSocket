# ChatEngine WebSocket Server

A modular monolith WebSocket server that acts as a bridge between Lovable frontend applications and Evolution WhatsApp API.

## Features

- **WebSocket Server**: Accepts connections from Lovable applications
- **JWT Authentication**: Validates Supabase JWT tokens
- **Workspace Discovery**: Discovers workspace and allowed WhatsApp instances
- **Evolution Integration**: Connects to Evolution API via WebSocket
- **Real-time Events**: Forwards messages.upsert and connection.update events
- **Command Processing**: Handles sendMessage and markAsRead commands

## Architecture

This project follows a modular monolith architecture with clear separation of concerns:

```
src/
├── core/                 # Core infrastructure (server, logger)
├── modules/
│   ├── auth/            # Authentication & authorization
│   ├── websocket/       # WebSocket server
│   ├── evolution/       # Evolution API client
│   └── infrastructure/  # Cross-cutting concerns (event coordination)
├── config/              # Configuration management
└── types/               # TypeScript type definitions
```

## Prerequisites

- Node.js 18+
- npm or bun
- Supabase project with authentication
- Evolution API instance

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd ChatEngineWebSocket
```

2. Install dependencies:
```bash
npm install
```

3. Copy environment configuration:
```bash
cp env.example .env
```

4. Configure environment variables in `.env`:
```env
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# ChatEngine Configuration (from CRM project)
CHATENGINE_JWT_SECRET=your-chatengine-jwt-secret-here

# Evolution API Configuration
EVOLUTION_API_BASE_URL=https://your-evolution-api.com
EVOLUTION_API_KEY=your-evolution-api-key-here

# Server Configuration
PORT=3001
NODE_ENV=development

# Logging
LOG_LEVEL=info
```

## Usage

### Development

```bash
# Using npm script
npm run dev

# Or using the development helper
node dev.js

# Check configuration
npm run config
```

### Production

```bash
npm run build
npm start
```

### Docker

```bash
docker build -t chatengine-websocket .
docker run -p 3001:3001 --env-file .env chatengine-websocket
```

## API

### WebSocket Events

#### From Server to Client

- `message`: New message received
- `connectionUpdate`: WhatsApp connection status update
- `messageSent`: Confirmation of sent message
- `markedAsRead`: Confirmation of mark as read
- `error`: Error occurred

#### From Client to Server

- `sendMessage`: Send a message
- `markAsRead`: Mark conversation as read
- `ping`: Health check

### Authentication

Clients must provide a valid Supabase JWT token in the handshake:

```javascript
const socket = io('ws://localhost:3001', {
  auth: {
    token: 'your-supabase-jwt-token'
  }
});
```

## Database Schema

The server expects the following Supabase tables:

- `profiles`: User profiles
- `workspaces`: Workspace information
- `workspace_members`: Workspace membership
- `whatsapp_numbers`: WhatsApp instance configurations

## Integration with CRM

This server is designed to work with the Whisper Flow CRM. The CRM generates JWT tokens that this server validates to ensure users only access allowed WhatsApp instances.

## Health Check

```bash
curl http://localhost:3001/health
```

## Logging

Logs are output to console with the following levels:
- `error`: Errors
- `warn`: Warnings
- `info`: General information
- `debug`: Debug information

Configure log level with the `LOG_LEVEL` environment variable.

## Deployment

### Environment Variables

All configuration is done via environment variables. See `env.example` for all available options.

### Docker

The application includes a multi-stage Dockerfile for optimized production builds.

### Scaling

This is a single-instance server. For high availability:
- Use a load balancer
- Implement sticky sessions for WebSocket connections
- Consider Redis for cross-instance communication if needed

## Development

### Project Structure

- `src/core/`: Core infrastructure
- `src/modules/`: Feature modules
- `src/config/`: Configuration management
- `src/types/`: TypeScript definitions

### Adding New Features

1. Create a new module in `src/modules/`
2. Export from the module's `index.ts`
3. Integrate with existing modules as needed
4. Update configuration if required

### Testing

```bash
npm test
```

## Deploy to GitHub

### Automated Setup (Recommended)

1. **Install GitHub CLI**:
   ```bash
   # Windows (via winget)
   winget install --id GitHub.cli

   # Or download from: https://cli.github.com/
   ```

2. **Authenticate**:
   ```bash
   gh auth login
   ```

3. **Run setup script**:
   ```bash
   # Linux/Mac
   ./setup-github.sh

   # Windows
   setup-github.bat
   ```

### Manual Setup

1. **Create repository on GitHub**:
   - Go to https://github.com/new
   - Repository name: `ChatEngineWebSocket`
   - Description: `Mini ChatEngine WebSocket server for Lovable integration with Evolution API`
   - Make it **Public**
   - Don't initialize with README

2. **Connect local repository**:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/ChatEngineWebSocket.git
   git push -u origin main
   ```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT