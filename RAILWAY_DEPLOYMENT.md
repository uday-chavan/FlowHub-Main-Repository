
# 🚂 Railway + Neon DB Deployment Guide

Deploy FlowHub on Railway with Neon PostgreSQL database completely free!

## 📋 Prerequisites
- GitHub account
- Gmail account (for OAuth)
- Google Cloud Console access

## 🗄️ Step 1: Set Up Free Database (Neon)

1. **Go to [Neon](https://neon.tech)**
2. **Sign up** with GitHub (no credit card required)
3. **Create new project**: 
   - Name: `flowhub-db`
   - Region: Choose closest to you
4. **Copy connection string** from dashboard
   - Format: `postgresql://username:password@ep-hostname.us-east-2.aws.neon.tech/neondb?sslmode=require`

## 🚀 Step 2: Deploy to Railway

1. **Go to [Railway](https://railway.app)**
2. **Sign up** with GitHub (no credit card required)
3. **New Project** → **Deploy from GitHub repo**
4. **Connect your FlowHub repository**
5. **Add Environment Variables**:
   ```
   DATABASE_URL=your_neon_connection_string_here
   GEMINI_API_KEY=your_gemini_api_key
   GOOGLE_CLIENT_ID=your_google_client_id  
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   SESSION_SECRET=create_a_long_random_string_here
   JWT_SECRET=create_another_random_string_here
   NODE_ENV=production
   ```

## 🔐 Step 3: Update Google OAuth Settings

1. **Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)**
2. **Edit your OAuth 2.0 Client ID**
3. **Add Authorized redirect URI**:
   ```
   https://your-app-name.railway.app/auth/gmail/callback
   ```

## ✅ Step 4: Deploy and Test

1. **Railway auto-deploys** from your GitHub repo
2. **Database migration** runs automatically via `npm run railway:deploy`
3. **Visit your app** at the Railway-provided URL
4. **Test Gmail integration** by connecting your account

## 💰 Free Tier Limits

### Railway ($5 free credits/month)
- ✅ **No sleep mode** (always running)
- ✅ **Custom domains**
- ✅ **Auto-deployments**
- ✅ **Environment variables**
- ✅ **Persistent storage**

### Neon Database (Free Tier)
- ✅ **3GB storage**
- ✅ **Compute time: 300 hours/month**
- ✅ **Unlimited queries**
- ✅ **Auto-scaling to zero**
- ✅ **1 concurrent connection**

## 🔍 Monitoring & Debugging

### Railway Dashboard
- Check deployment logs
- Monitor resource usage
- View environment variables
- Custom domain setup

### Health Check
Your app includes a health endpoint at `/health` that Railway uses for monitoring.

## 🚨 Troubleshooting

### Common Issues:
1. **Database connection errors**: Check DATABASE_URL format
2. **OAuth errors**: Verify redirect URI in Google Console
3. **Build failures**: Check environment variables are set
4. **Memory issues**: Optimize database connections (already configured)

### Logs Access:
```bash
# Railway CLI (optional)
npm install -g @railway/cli
railway login
railway logs
```

## 🔧 Production Optimizations

The codebase includes:
- ✅ **Connection pooling** for Neon DB
- ✅ **Graceful shutdown** handling
- ✅ **Health checks** for Railway
- ✅ **SSL/TLS** configuration
- ✅ **Environment-based** configuration

## 🎯 Next Steps

1. **Custom Domain**: Add your domain in Railway dashboard
2. **Monitoring**: Set up alerts in Railway
3. **Scaling**: Upgrade plans when needed
4. **Backups**: Neon provides automatic backups

Your FlowHub Command Center is now ready for production! 🎉
