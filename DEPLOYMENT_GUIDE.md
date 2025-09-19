# 🚀 Free Deployment Guide (No Credit Card Required)

FlowHub is ready for deployment on **Railway** with **Neon** PostgreSQL database - both completely free for students!

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
   - Format: `postgresql://username:password@hostname:5432/database_name`

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
   NODE_ENV=production
   ```

## 🔐 Step 3: Update Google OAuth Settings

1. **Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)**
2. **Edit your OAuth 2.0 Client ID**
3. **Add Authorized redirect URI**:
   ```
   https://your-railway-domain.railway.app/auth/gmail/callback
   ```
   *(Replace with your actual Railway domain)*

## ✅ Step 4: Deploy and Test

1. **Railway auto-deploys** from your GitHub repo
2. **Database migration** runs automatically
3. **Visit your app** at the Railway-provided URL
4. **Test Gmail integration** by connecting your account

## 💰 Free Tier Limits

### Railway ($5 free credits/month)
- ✅ **No sleep mode** (always running)
- ✅ **Custom domains**
- ✅ **Auto-deployments**
- ✅ **Environment variables**

### Neon Database
- ✅ **3GB storage**
- ✅ **10 branches**
- ✅ **Unlimited queries**
- ✅ **Auto-scaling**

## 🔄 Alternative: Render + Neon

If you prefer **Render** (completely free but sleeps after 15 minutes):

1. **Go to [Render](https://render.com)**
2. **Connect GitHub repo**
3. **Use same environment variables**
4. **Deploy automatically**

## 🚨 Important Notes

- **Keep your API keys secure** - never commit them to GitHub
- **Free tiers are perfect** for student projects and portfolios
- **Both platforms scale** when you need more resources later
- **No credit card required** for either platform

## 🆘 Need Help?

Check the logs in Railway/Render dashboard if deployment fails. Most issues are related to:
1. Missing environment variables
2. Incorrect database connection string
3. Google OAuth redirect URI mismatch

Your FlowHub is now ready for the world! 🎉