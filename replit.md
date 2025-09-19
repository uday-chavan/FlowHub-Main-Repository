# Overview

FlowHub Command Center is a comprehensive executive dashboard designed to streamline workplace productivity through intelligent notification management, task workflow optimization, and real-time performance monitoring. The application serves as a centralized hub for managing multiple workplace applications, AI-powered task prioritization, and wellness tracking to optimize executive decision-making and workflow efficiency.

## ✅ PRODUCTION READY STATUS
- ✅ **Smart Workflow Optimization**: AI-powered task prioritization with time parsing
- ✅ **Gmail Integration**: Full OAuth integration with email notifications  
- ✅ **Database Schema**: Stable and production-ready with full data persistence
- ✅ **Time Intelligence**: Enhanced parsing of relative time patterns including "tomorrow", "in 1 hour", "in 30 minutes", etc.
- ✅ **Priority Sections**: Visual organization with urgent/important/normal categorization
- ✅ **Manual Task Creation**: Calendar/time picker for precise scheduling with automatic priority assignment
- ✅ **Data Persistence**: All tasks, notifications, and settings permanently stored in PostgreSQL
- ✅ **Overdue Display**: Improved handling for old dates and relative time mentions
- ✅ **Production Build**: Clean builds with no errors or debugging code

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture

The frontend is built with **React 18** using **Vite** as the build tool and development server. The application follows a component-based architecture with:

- **Routing**: Uses Wouter for lightweight client-side routing with pages for intro, app-links, landing, and dashboard
- **State Management**: TanStack React Query for server state management, caching, and real-time data synchronization
- **UI Framework**: Shadcn/UI components built on Radix UI primitives with Tailwind CSS for styling using a dark theme with custom color variables
- **TypeScript**: Full TypeScript implementation for type safety across the entire frontend

The frontend structure follows a modular design with dashboard components organized by feature:
- Dashboard layout with responsive 12-column grid system
- Real-time metrics visualization with animated progress bars
- Notification feed with AI analysis and source app integration
- Task workflow management system ("WorkflowRiver") with priority-based organization
- Connected app launcher for quick access to workplace tools
- Wellness and performance monitoring panels with focus scoring

## Backend Architecture

The backend is an **Express.js** server with TypeScript, structured around:

- **RESTful API**: Express routes for CRUD operations on users, tasks, notifications, connected apps, user metrics, and AI insights
- **Database Layer**: Drizzle ORM with PostgreSQL for data persistence using Neon serverless database
- **AI Integration**: Google Gemini AI integration for notification analysis, workflow optimization, and wellness insights
- **Session Management**: Connect-pg-simple for PostgreSQL-based session storage
- **Development Setup**: Vite integration for hot module replacement in development with custom logging middleware

Key backend features include:
- OAuth integration for Gmail and other workplace applications
- Real-time notification processing and AI analysis
- Task workflow optimization algorithms
- Performance metrics calculation and wellness insights generation

## Database Schema

The PostgreSQL database uses Drizzle ORM with the following key entities:

- **Users**: Core user profiles with authentication data, roles, and profile information
- **Tasks**: Workflow tasks with priority levels (urgent/important/normal), status tracking (pending/in_progress/completed/paused), time estimates, and due dates
- **Notifications**: Cross-platform notifications with AI analysis metadata, priority classification, and source app integration
- **Connected Apps**: Integration status for external workplace applications (Gmail, Slack, Notion, Trello, Zoom, Calendar)
- **User Metrics**: Performance analytics including focus scores, workload capacity, stress levels, and wellness tracking data
- **AI Insights**: Machine learning-generated recommendations for workflow optimization, deadline alerts, and wellness suggestions
- **User App Links**: Custom app links and integrations for personalized workspace access

Schema includes proper foreign key relationships, PostgreSQL enums for standardized values (including 'manual' for user-created tasks), automatic timestamp tracking, and UUID primary keys for scalability.

## Portability Features

✅ **Database Independence**: Uses Drizzle ORM for database-agnostic operations
✅ **Environment Configuration**: All API keys and secrets managed through environment variables
✅ **Modular Architecture**: Clean separation between frontend, backend, and database layers
✅ **Docker Ready**: Project structure supports containerization for deployment
✅ **Migration Support**: Database schema changes handled through Drizzle migrations
✅ **Complete Documentation**: Full setup and deployment instructions included

# Setup Instructions for Any Device

## Prerequisites
- **Node.js 20+** (Download from nodejs.org)
- **PostgreSQL database** (Local installation or cloud service like Neon)
- **Google Cloud Project** with Gmail API enabled
- **Google Gemini API key**

## Quick Start (5 minutes)
1. **Extract zip file** and navigate to project directory
2. **Install dependencies**: `npm install`
3. **Copy environment file**: `cp .env.example .env`
4. **Configure environment variables** in `.env` file:
   ```
   GEMINI_API_KEY=your_gemini_api_key_here
   GOOGLE_CLIENT_ID=your_google_client_id_here  
   GOOGLE_CLIENT_SECRET=your_google_client_secret_here
   DATABASE_URL=postgresql://username:password@localhost:5432/flowhub
   SESSION_SECRET=your_random_session_secret_here
   ```
5. **Setup database**: `npm run db:push`
6. **Start development**: `npm run dev`
7. **Visit**: http://localhost:5000

## Production Deployment
- **Build**: `npm run build`
- **Start**: `npm start`
- **Deploy**: Ready for any hosting platform (Vercel, Railway, Render, etc.)

## External Dependencies

## AI Services
- **Google Gemini AI** (via @google/genai): Powers notification analysis, workflow optimization, and wellness insights generation using the latest Gemini 2.5 models

## Database & Infrastructure
- **Neon PostgreSQL**: Serverless PostgreSQL database for scalable data storage
- **Drizzle ORM**: Type-safe database operations with PostgreSQL dialect

## Authentication & Integration
- **Google OAuth**: **FULLY IMPLEMENTED** Gmail integration for real-time email notifications with popup display functionality - OAuth flow, token management, email fetching, and UI integration all working perfectly
- **Slack Web API**: Slack notifications and team communication integration

## Smart Workflow Optimization Features
✅ **AI-Powered Task Analysis**: Uses Gemini 2.5 Pro to intelligently categorize tasks
✅ **Enhanced Time Pattern Recognition**: Automatically parses "in 5 min", "in 1 hour", "tomorrow", "in 30 minutes", etc.
✅ **Priority Categorization**: 
  - 🚨 **Urgent**: Critical deadlines within 3 hours
  - ⚡ **Important**: Significant impact, deadlines within 24 hours  
  - 📋 **Normal**: Standard work items, longer timeframes
✅ **Visual Organization**: Color-coded sections with task counts and time displays
✅ **Real-time Sorting**: Tasks automatically ordered by time urgency within each priority
✅ **Manual Task Creation**: Calendar/time picker interface with automatic priority assignment
✅ **Improved Overdue Handling**: Better display for old dates and relative time mentions
✅ **Full Data Persistence**: All tasks permanently stored in PostgreSQL database

## Production Status - FULLY READY
✅ **Gmail Integration**: Complete OAuth + notification display with dark theme support
✅ **AI Task Limits**: 50 tasks/month enforced with progress tracking and proper blocking  
✅ **Persistent Auth**: JWT cookies with 7-day sessions + 30-day refresh tokens
✅ **AWS Deployment**: Complete Free Tier guide with EC2 + RDS PostgreSQL
✅ **User Data Persistence**: All emails, profiles, usage tracking stored permanently
✅ **Clean Project**: Unnecessary files removed, production configuration ready
✅ **Usage Analytics**: Track conversions, time saved, plan usage with proper UI indicators

## Frontend Libraries
- **Radix UI**: Accessible component primitives for consistent UI interactions
- **TanStack React Query**: Server state management with automatic caching and background updates
- **Wouter**: Lightweight client-side routing
- **Tailwind CSS**: Utility-first CSS framework with custom dark theme implementation
- **Lucide React**: Icon library for consistent visual elements

## Development Tools
- **Vite**: Fast build tool and development server with HMR support
- **TypeScript**: Static typing for improved developer experience and code reliability
- **ESBuild**: Fast JavaScript bundler for production builds