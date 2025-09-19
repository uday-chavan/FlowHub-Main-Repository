# 🌟 FlowHub Command Center

A comprehensive executive dashboard designed to streamline workplace productivity through intelligent notification management, task workflow optimization, and real-time performance monitoring.

## ✨ Production Features

- 🤖 **AI-Powered Task Management**: Smart prioritization with Gemini 2.5 Pro
- 📧 **Gmail Integration**: Real-time OAuth notifications with popup display
- ⚡ **Usage Limits**: 50 AI task conversions/month (Free plan) with progress tracking
- 🔐 **Persistent Authentication**: 7-day JWT sessions with auto-refresh
- 🎨 **Dark Theme Ready**: Fully responsive with dark/light theme support
- 📊 **Usage Analytics**: Track converted emails, time saved, task completion
- 🔒 **Security First**: HTTP-only cookies, rate limiting, input validation

## 🚀 Quick Start

### Prerequisites
- **Node.js >= 20.0.0**
- **PostgreSQL Database** (local, Neon, or AWS RDS)
- **Google API Keys**: Gemini AI + Gmail OAuth credentials

### Local Development (5 minutes)
```bash
# 1. Clone and install
git clone <your-repo>
cd flowhub
npm ci

# 2. Configure environment
cp .env.example .env
# Edit .env with your API keys

# 3. Setup database
npm run db:push

# 4. Start development
npm run dev
# Visit: http://localhost:5000
```

### Production Deployment
```bash
# Build and start
npm run build
npm start

# Or one-command production setup
npm run install:prod
```

## ☁️ AWS Free Tier Deployment

Deploy on AWS with **EC2 + RDS PostgreSQL** for FREE:

- **EC2**: t2.micro (750 hours/month)
- **RDS**: db.t3.micro PostgreSQL (750 hours/month + 20GB)
- **Cost**: $0 for 12 months, ~$25/month after

📖 **Complete Guide**: See [AWS_DEPLOYMENT.md](./AWS_DEPLOYMENT.md)

## 🏗️ Architecture

### Tech Stack
- **Frontend**: React 18, TypeScript, Tailwind CSS, Radix UI
- **Backend**: Express.js, TypeScript, Drizzle ORM
- **Database**: PostgreSQL with full CRUD + usage tracking
- **AI**: Google Gemini 2.5 Pro for task analysis
- **Auth**: OAuth 2.0 + JWT with secure session management

### Database Schema
```sql
✅ users (profiles, authentication)
✅ tasks (AI-enhanced with priorities) 
✅ userUsage (monthly AI limit tracking)
✅ notifications (cross-platform feed)
✅ encryptedGmailTokens (secure OAuth storage)
✅ priorityEmails (user preferences)
```

## 📁 Clean Project Structure

```
flowhub/
├── client/src/           # React TypeScript frontend
│   ├── components/       # Reusable UI components
│   ├── pages/           # Route components
│   └── hooks/           # Custom React hooks
├── server/              # Express TypeScript backend
│   ├── auth.ts          # JWT + OAuth authentication
│   ├── routes.ts        # API endpoints + AI integration
│   └── storage.ts       # Database operations + limits
├── shared/schema.ts     # Drizzle database schema
├── .env.example         # Complete environment template
├── AWS_DEPLOYMENT.md    # Production deployment guide
└── package.json         # Scripts + dependencies
```

## 🔧 Environment Configuration

All API keys managed securely via `.env`:

```env
# AI & Authentication
GEMINI_API_KEY=          # Google AI Studio
GOOGLE_CLIENT_ID=        # Google Cloud Console  
GOOGLE_CLIENT_SECRET=    # Google Cloud Console
GMAIL_APP_PASSWORD=      # Gmail 2FA app password
SMTP_USER=              # Your Gmail address

# Database & Security
DATABASE_URL=           # PostgreSQL connection
SESSION_SECRET=         # Random 32+ chars
JWT_SECRET=            # Production JWT secret

# Deployment
NODE_ENV=production
PORT=5000
GOOGLE_REDIRECT_URI=   # OAuth callback URL
```

## 🎯 User Features

### For End Users:
- ✅ **Persistent Login**: Stay logged in across browser sessions
- ✅ **AI Task Creation**: Natural language → smart tasks (50/month free)
- ✅ **Gmail Notifications**: Real-time email alerts with OAuth
- ✅ **Usage Tracking**: Monitor AI conversions + limits
- ✅ **Dark Theme**: Beautiful UI that adapts to preferences
- ✅ **Data Persistence**: All tasks, emails, and settings saved

### For Developers:
- ✅ **AWS Ready**: Complete Free Tier deployment guide
- ✅ **Type Safe**: Full TypeScript implementation  
- ✅ **Database Agnostic**: Works with any PostgreSQL host
- ✅ **Scalable**: Usage limits, rate limiting, proper indexes
- ✅ **Security**: JWT tokens, encrypted OAuth, input validation

## 🚀 Deployment Options

| Option | Cost | Setup Time | Best For |
|--------|------|------------|----------|
| **AWS Free Tier** | $0/year | 30 min | Production ready |
| **Local Development** | Free | 5 min | Testing |
| **Neon + Vercel** | ~$5/month | 15 min | Serverless |
| **Railway** | ~$10/month | 10 min | Simple deployment |

## 📊 Production Ready

- ✅ **Error Handling**: Graceful failures with user feedback
- ✅ **Rate Limiting**: AI usage controls per user/month
- ✅ **Security**: JWT cookies, HTTPS ready, input sanitization
- ✅ **Monitoring**: PM2 ready with log rotation
- ✅ **Performance**: Build optimizations, asset caching
- ✅ **Documentation**: Complete setup guides included

## 📈 Scaling Features

- **Usage Limits**: Free (50), Basic (100), Premium (500) AI tasks/month
- **Plan Management**: Built-in subscription handling (Razorpay ready)
- **Multi-tenant**: User isolation and data privacy
- **API Ready**: RESTful endpoints for integrations
- **Analytics**: Track user engagement and feature usage

## 📄 License

MIT License - Production ready for commercial use

---

**Ready to deploy?** Start with [AWS_DEPLOYMENT.md](./AWS_DEPLOYMENT.md) for a complete production setup guide! 🎉