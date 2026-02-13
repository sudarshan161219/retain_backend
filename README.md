# Retain (Backend)

The server-side API and WebSocket handler for the Retain Dashboard. This service manages project data, authentication (token-based), and broadcasts real-time updates to connected clients.

## ✨ Features

- **RESTful API:** Handles CRUD operations for clients, logs, and project settings.
- **Real-Time Sockets:** Powered by [Socket.io](https://socket.io/). Broadcasts budget updates and log entries to the frontend instantly.
- **Prisma ORM:** Type-safe database access with PostgreSQL.
- **Tokenless Auth:** Uses unique high-entropy strings for Admin access and public slugs for Client read-only access.
- **Input Validation:** Robust request validation using `express-validator`.

## 🛠 Tech Stack

- **Runtime:** Node.js (TypeScript)
- **Framework:** Express.js
- **Database:** PostgreSQL
- **ORM:** Prisma
- **Real-Time:** Socket.io
- **Validation:** Express Validator / Zod

## 🚀 Getting Started

### Prerequisites

- Node.js (v18+)
- PostgreSQL Database (Local or Cloud like Neon/Supabase)

### Installation

1. **Clone the repository**
   ```bash
   git clone [https://github.com/yourusername/retain-backend.git](https://github.com/yourusername/retain-backend.git)
   cd retain-backend
   ```
