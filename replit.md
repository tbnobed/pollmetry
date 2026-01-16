# PollMetry.io - Real-time Audience Polling System

## Overview

PollMetry.io is a real-time audience polling system designed for livestream and hybrid (in-room + remote) environments. The application enables pollsters to create and manage interactive polling sessions while allowing audiences to participate via short join codes. It features three distinct interfaces: a Producer Console for poll management, an Audience voting interface, and a Dashboard for real-time analytics with segment comparison (room vs remote participants).

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack React Query for server state and caching
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with a custom design system (Fluent Design + Linear-inspired aesthetics)
- **Real-time Communication**: Socket.IO client for WebSocket connections
- **Theming**: Custom ThemeProvider supporting dark/light mode with CSS variables

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ESM modules
- **Real-time Layer**: Socket.IO server for bidirectional WebSocket communication
- **Session Management**: Express-session for pollster authentication
- **API Design**: RESTful endpoints under `/api/*` prefix with WebSocket events for real-time updates

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM
- **Schema Location**: `shared/schema.ts` contains all table definitions
- **Key Entities**: Users, Sessions (polling sessions with codes), Questions (multiple choice, slider, emoji types), VoteEvents (append-only vote log)
- **Migrations**: Managed via Drizzle Kit with `db:push` command

### Authentication & Authorization
- **Pollster Auth**: Simple username/password with SHA-256 hashing, session-based authentication
- **Audience**: Anonymous participation using localStorage voter tokens (hashed for duplicate vote prevention)
- **Session Protection**: `requireAuth` middleware guards pollster-only routes

### Real-time Voting System
- **Question States**: DRAFT → LIVE → CLOSED lifecycle
- **Vote Tallying**: Database storage with real-time updates via WebSocket
- **Segment Tracking**: Votes tagged with "room" or "remote" segment based on join path query parameter
- **Controls**: Go Live, Close, Reveal/Hide Results, Freeze, Reset votes per question

### Project Structure
```
client/           # React frontend application
  src/
    components/   # Reusable UI components (shadcn/ui)
    pages/        # Route-level page components
    lib/          # Utilities (queryClient, socket, voter-token)
    hooks/        # Custom React hooks
server/           # Express backend
  routes.ts       # API routes and Socket.IO handlers
  storage.ts      # Database access layer (IStorage interface)
  db.ts           # Drizzle database connection
shared/           # Shared types and schemas
  schema.ts       # Drizzle table definitions and Zod schemas
```

## External Dependencies

### Database
- **PostgreSQL**: Primary data store, connection via `DATABASE_URL` environment variable
- **Drizzle ORM**: Type-safe database queries and schema management

### Real-time Communication
- **Socket.IO**: WebSocket layer for live voting updates, question state changes, and result broadcasting

### Authentication
- **express-session**: Server-side session management for pollster login persistence

### UI Framework
- **Radix UI**: Accessible component primitives (dialogs, dropdowns, tabs, etc.)
- **Recharts**: Charting library for dashboard visualizations
- **Lucide React**: Icon library

### Build & Development
- **Vite**: Frontend build tool with HMR support
- **esbuild**: Backend bundling for production
- **TSX**: TypeScript execution for development server