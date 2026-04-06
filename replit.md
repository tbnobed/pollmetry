# PollMetry.io - Real-time Audience Polling System

## Overview

PollMetry.io is a real-time audience polling system designed for livestream and hybrid (in-room + remote) environments. The application enables pollsters to create and manage interactive polling sessions while allowing audiences to participate via short join codes. It features three distinct interfaces: a Producer Console for poll management, an Audience voting interface, and a Dashboard for real-time analytics with segment comparison (room vs remote participants).

### Session Modes
The application supports three session modes:
- **Live Polling**: Real-time voting where the pollster controls when each question goes live
- **Survey Mode**: Self-paced kiosk mode where a single device is shared by multiple participants who answer questions sequentially with auto-advance and thank you screens between participants
- **Q&A Session**: Dedicated question-and-answer mode where audience submits questions/comments in real time; pollster manages them with star, dismiss, search, and filter tools
- **Custom Messages**: All session types support optional `openingMessage` and `closingMessage` fields, displayed on the audience waiting/start screen and end/thank-you screen respectively

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
- **Vote Tallying**: SQL-aggregated tallies (GROUP BY) for scalability, real-time updates via WebSocket
- **Duplicate Vote Prevention**: UNIQUE constraint on (questionId, voterTokenHash) with atomic INSERT ON CONFLICT DO NOTHING
- **Segment Tracking**: Votes tagged with "room" or "remote" segment based on join path query parameter
- **Controls**: Go Live, Close, Reveal/Hide Results, Freeze, Reset votes per question

### Real-time Q&A Module
- **Session Type**: "Q&A Session" is a dedicated session mode (alongside Live Polling and Survey Mode)
- **Audience Side**: Full-page Q&A join experience at `/qa/:code` with question submission (max 500 chars), sent confirmation, submission counter; also available as floating widget on Live Polling join pages
- **Pollster Side**: Dedicated Q&A Manager at `/console/:id/qa` with real-time message feed, star/dismiss/delete actions, search, Active/Starred/All filters, session stats (total/active/starred/viewers/room vs remote), QR code, and open/close controls
- **Table**: `audience_messages` (id, sessionId, voterTokenHash, segment, message, isStarred, isDismissed, createdAt)
- **Security**: Session ownership checks on all moderation endpoints; voterTokenHash stripped from API responses; socket membership validated before message submission; boolean input validation on star/dismiss
- **Real-time**: Messages delivered instantly to pollster via `audience:new_message` WebSocket event; `message:confirmed` event sent back to audience
- **Pages**: `client/src/pages/qa-manager.tsx` (pollster), `client/src/pages/qa-join.tsx` (audience), `client/src/components/audience-qa.tsx` (floating widget for live polling), `client/src/components/pollster-qa-panel.tsx` (sidebar panel for live polling)
- **Routing**: `/join/:code` auto-redirects to `/qa/:code` for Q&A sessions; `/console/:id` auto-redirects to `/console/:id/qa` for Q&A sessions

### Production Hardening (500+ users)
- **Socket.IO**: WebSocket-first transport, pingTimeout 60s, pingInterval 25s, perMessageDeflate compression (>1KB threshold)
- **Database Pool**: max 20, min 5, 10s connection timeout, 30s idle timeout
- **Error Boundaries**: All async socket handlers wrapped in safeHandler to prevent unhandled rejections
- **Memory Management**: Auth token cleanup interval (hourly), empty room Map cleanup on disconnect
- **Monitoring**: `/api/health` (public), `/api/stats` (admin-only), connection tracking per session
- **Database Indexes**: Composite unique index on vote_events(question_id, voter_token_hash), indexes on session_id, question_id, created_at

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