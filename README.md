# Formit - Intelligent Microbiological Analysis

**Formit** is an AI-powered web application designed to automatically analyze microbiological analysis PDF documents and verify their conformity against regulatory limits.

## 🚀 Features

- **Automated PDF Analysis**: Upload and process microbiological analysis reports (PDF).
- **AI Extraction**: Utilizes Large Language Models (LLMs) via LangChain to extract:
  - Food matrix/product type.
  - Regulatory categories (e.g., CEIRSA, beverages).
  - Microbiological parameters and results.
- **Conformity Verification**: Automatically checks results against regulatory limits.
- **Custom Checks**: Create and manage custom verification categories with user-defined parameters.
- **Queue Management**: Robust background processing using BullMQ and Redis for handling multiple files.
- **Modern Stack**: Built with React, Node.js (Fastify), Prisma, and TypeScript.

## 🛠 Tech Stack

- **Frontend**: React, Vite, TailwindCSS (implied via UI), React Query.
- **Backend**: Node.js, Fastify, LangChain (OpenAI/Anthropic integration).
- **Database**: SQLite (via Prisma ORM).
- **Queue**: Redis & BullMQ.
- **Infrastructure**: Docker & Docker Compose.
- **MCP**: Implements Model Context Protocol for standardized AI interactions.

## 📋 Prerequisites

Before running the application, ensure you have the following installed:

- **Docker Desktop** (Recommended for easiest setup)
- **Node.js 20+** (For local development)
- **npm** or **yarn**

## 🐳 Quick Start (Docker)

The easiest way to run Formit is using Docker Compose. This starts the Database, Redis, Backend, and Frontend services automatically.

### Start Application

```bash
# Start all services in the background
docker compose up -d

# View logs
docker compose logs -f
```

Once started, access the application at:
- **Frontend**: [http://localhost:5173](http://localhost:5173)
- **Backend API**: [http://localhost:3007](http://localhost:3007)
- **API Docs (Swagger)**: [http://localhost:3007/docs](http://localhost:3007/docs)

### Stop Application

```bash
docker compose down
```

## 💻 Local Development Setup

If you want to contribute or modify the code, follow these steps to run the services locally.

### 1. Backend Setup

```bash
# Install dependencies
npm install

# Setup Environment Variables
# Copy example .env if available, otherwise ensure DATABASE_URL is set
# Default: DATABASE_URL="file:./dev.db"

# Generate Prisma Client
npm run prisma:generate

# Run Database Migrations
npm run prisma:migrate

# Start Backend in Development Mode
npm run api:dev
```

### 2. Frontend Setup

```bash
cd client

# Install dependencies
npm install

# Start Frontend
npm run dev
```

### 3. Worker & Queue Setup

The PDF processing requires Redis and the worker process running.

```bash
# Ensure Redis is running (e.g., via Docker)
docker run -d -p 6380:6379 redis

# Start the worker process
npm run dev # This starts the main entry point which orchestrates services
```

## 📂 Project Structure

- `client/` - React frontend application.
- `src/server/` - Backend API (Fastify) and controllers.
- `src/modules/` - Business logic including conformity checks (CEIRSA, custom, etc.).
- `src/mcp/` - Model Context Protocol integration.
- `prisma/` - Database schema and migrations.
- `scripts/` - Utility scripts for setup/deployment.

## 🧪 Testing

Run integration tests using Vitest:

```bash
npm test
```

## 📄 License

This project is licensed under the MIT License.
