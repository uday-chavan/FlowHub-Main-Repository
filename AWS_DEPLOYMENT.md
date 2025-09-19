# 🚀 AWS Free Tier Deployment Guide - FlowHub Command Center

Complete guide to deploy FlowHub on AWS Free Tier with **EC2 + RDS PostgreSQL**.

## 📋 AWS Free Tier Resources

### What You Get (12 months free for new accounts):
- **EC2**: 750 hours/month of t2.micro/t3.micro instances
- **RDS PostgreSQL**: 750 hours/month of db.t3.micro + 20GB storage
- **Data Transfer**: 15GB outbound per month
- **Elastic Load Balancer**: 750 hours/month (optional)

## 🏗️ Architecture Overview

```
Internet → EC2 t2.micro → RDS PostgreSQL db.t3.micro
         (Node.js + PM2)    (20GB GP2 Storage)
```

## 📦 Prerequisites

1. **AWS Account** (with Free Tier eligibility)
2. **Domain** (optional - you can use EC2 public IP)
3. **API Keys**: Google Gemini, Gmail OAuth credentials

## 🚀 Step-by-Step Deployment

### Step 1: Set Up RDS PostgreSQL Database

1. **Go to RDS Console** → Create database
2. **Engine**: PostgreSQL (latest version)
3. **Template**: Free Tier
4. **Instance Class**: db.t3.micro
5. **Storage**: 20 GB GP2 (DO NOT enable autoscaling)
6. **Settings**:
   ```
   DB Instance ID: flowhub-db
   Master username: postgres
   Master password: [secure-password]
   ```
7. **Connectivity**:
   - Public access: Yes
   - VPC security group: Create new
   - Port: 5432
8. **Create Database** (takes ~10 minutes)

### Step 2: Configure Database Security Group

1. **Go to EC2 Console** → Security Groups
2. **Find RDS security group** (rds-launch-wizard-X)
3. **Edit Inbound Rules**:
   ```
   Type: PostgreSQL
   Port: 5432
   Source: My IP (your current IP)
   Description: Allow PostgreSQL access
   ```
4. **Save Rules**

### Step 3: Launch EC2 Instance

1. **Go to EC2 Console** → Launch Instance
2. **Name**: `flowhub-server`
3. **AMI**: Ubuntu Server 22.04 LTS (Free Tier eligible)
4. **Instance Type**: t2.micro (Free Tier eligible)
5. **Key Pair**: Create new or use existing
6. **Security Group**: Create new with rules:
   ```
   SSH (22): Your IP
   HTTP (80): 0.0.0.0/0
   HTTPS (443): 0.0.0.0/0
   Custom (5000): 0.0.0.0/0 [for testing]
   ```
7. **Storage**: 8 GB GP3 (Free Tier: up to 30GB)
8. **Launch Instance**

### Step 4: Connect to EC2 and Install Dependencies

```bash
# Connect to your EC2 instance
ssh -i "your-key.pem" ubuntu@your-ec2-ip

# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Install Git
sudo apt install git -y

# Install Nginx (optional - for reverse proxy)
sudo apt install nginx -y

# Verify installations
node --version  # Should show v20.x
npm --version   # Should show npm version
pm2 --version   # Should show PM2 version
```

### Step 5: Deploy FlowHub Application

```bash
# Clone your repository (replace with your repo URL)
git clone https://github.com/yourusername/flowhub.git
cd flowhub

# Install dependencies
npm ci

# Create environment file
cp .env.example .env
nano .env
```

**Configure `.env` file**:
```env
# Update these values
GEMINI_API_KEY=your_gemini_api_key
GOOGLE_CLIENT_ID=your_google_client_id  
GOOGLE_CLIENT_SECRET=your_google_client_secret
GMAIL_APP_PASSWORD=your_gmail_app_password
SMTP_USER=your_gmail@gmail.com

# RDS Database URL (replace with your RDS endpoint)
DATABASE_URL=postgresql://postgres:your-password@your-rds-endpoint.region.rds.amazonaws.com:5432/postgres

# Security
SESSION_SECRET=your_secure_random_32_character_string
JWT_SECRET=your_jwt_secret_32_character_string

# Production settings
NODE_ENV=production
PORT=5000

# OAuth redirect (replace with your domain or EC2 IP)
GOOGLE_REDIRECT_URI=http://your-ec2-ip:5000/auth/gmail/callback
```

```bash
# Set up database schema
npm run db:push

# Build the application
npm run build

# Test the application locally
npm start
# Should see: "serving on port 5000"
# Press Ctrl+C to stop
```

### Step 6: Configure PM2 for Production

```bash
# Create PM2 ecosystem file
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'flowhub',
    script: 'dist/server/index.js',
    instances: 1,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    error_file: '/var/log/pm2/flowhub-error.log',
    out_file: '/var/log/pm2/flowhub-out.log',
    log_file: '/var/log/pm2/flowhub.log',
    time: true,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 1000
  }]
}
EOF

# Create log directory
sudo mkdir -p /var/log/pm2
sudo chown ubuntu:ubuntu /var/log/pm2

# Start application with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup

# Follow the instructions from pm2 startup command
```

### Step 7: Configure Nginx (Optional but Recommended)

```bash
# Create Nginx configuration
sudo nano /etc/nginx/sites-available/flowhub

# Add this configuration:
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;  # or your-ec2-ip

    client_max_body_size 100M;
    
    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# Enable the site
sudo ln -s /etc/nginx/sites-available/flowhub /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl enable nginx
```

### Step 8: Configure Google OAuth

1. **Go to Google Cloud Console** → APIs & Services → Credentials
2. **Edit your OAuth 2.0 Client**
3. **Add Authorized Redirect URIs**:
   ```
   http://your-ec2-ip:5000/auth/gmail/callback
   http://your-domain.com/auth/gmail/callback  (if using domain)
   https://your-domain.com/auth/gmail/callback (if using SSL)
   ```
4. **Save Changes**

### Step 9: Test Your Deployment

```bash
# Check PM2 status
pm2 status

# View logs
pm2 logs flowhub

# Check application health
curl http://localhost:5000/api/auth/me

# Access your application
# Visit: http://your-ec2-ip or http://your-domain.com
```

## 🔒 Security Hardening

### SSL Certificate (Free with Let's Encrypt)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Get SSL certificate
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

### Database Security

```bash
# Update RDS security group to only allow EC2 access
# Go to EC2 → Security Groups → RDS Security Group
# Edit Inbound Rules:
# Type: PostgreSQL, Port: 5432, Source: [EC2-Security-Group-ID]
```

## 📊 Monitoring & Maintenance

### PM2 Monitoring

```bash
# Monitor processes
pm2 monit

# Restart application
pm2 restart flowhub

# View detailed logs
pm2 logs flowhub --lines 100

# Update application
git pull origin main
npm ci
npm run build
pm2 restart flowhub
```

### AWS CloudWatch (Optional)

1. **Enable detailed monitoring** in EC2 console
2. **Create CloudWatch alarms** for:
   - CPU utilization > 80%
   - Memory usage > 90%
   - Disk space > 85%

## 💰 Cost Management

### Stay Within Free Tier:

- **Monitor usage** in AWS Billing Console
- **Set up billing alerts** at $5, $10, $15
- **Check Free Tier usage** regularly
- **RDS**: Use exactly 20GB storage, no autoscaling
- **EC2**: 750 hours = 31 days continuous running

### Expected Monthly Costs After Free Tier:
- **EC2 t2.micro**: ~$8.50/month
- **RDS db.t3.micro**: ~$12.60/month  
- **20GB GP2 Storage**: ~$2.30/month
- **Data Transfer**: $0.09/GB after 15GB
- **Total**: ~$25-30/month

## 🚨 Troubleshooting

### Common Issues:

1. **Database Connection Failed**
   ```bash
   # Check security group allows port 5432
   # Verify DATABASE_URL format
   # Test connection: psql "DATABASE_URL"
   ```

2. **Application Won't Start**
   ```bash
   pm2 logs flowhub
   # Check environment variables
   # Verify build completed successfully
   ```

3. **Gmail OAuth Error**
   ```bash
   # Verify redirect URI in Google Console
   # Check GOOGLE_CLIENT_ID/SECRET
   # Ensure OAuth consent screen configured
   ```

4. **High Memory Usage**
   ```bash
   # Monitor: pm2 monit
   # Add swap file if needed:
   sudo fallocate -l 1G /swapfile
   sudo chmod 600 /swapfile
   sudo mkswap /swapfile
   sudo swapon /swapfile
   ```

## ✅ Production Checklist

- [ ] RDS database created (db.t3.micro, 20GB GP2)
- [ ] EC2 instance running (t2.micro)
- [ ] Security groups configured correctly
- [ ] Environment variables set
- [ ] Database schema deployed (`npm run db:push`)
- [ ] Application built (`npm run build`)
- [ ] PM2 running application
- [ ] Nginx configured (optional)
- [ ] SSL certificate installed (optional)
- [ ] Google OAuth redirect URIs updated
- [ ] Monitoring and alerts set up
- [ ] Backup strategy in place

## 🎯 Performance Tips

- **Enable RDS monitoring** for query optimization
- **Use PM2 cluster mode** for better performance
- **Configure Nginx caching** for static assets
- **Monitor AWS CloudWatch metrics**
- **Optimize database queries** with indexes

Your FlowHub Command Center is now ready for production on AWS Free Tier! 🎉