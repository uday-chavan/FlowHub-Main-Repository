
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Request, Response, NextFunction } from 'express';
import { storage } from './storage';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
  };
}

// Environment validation for production
function validateEnvironment() {
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (isProduction && !process.env.JWT_SECRET) {
    throw new Error('SECURITY ERROR: JWT_SECRET environment variable is required in production');
  }
  
  if (isProduction && !process.env.DATABASE_URL) {
    throw new Error('SECURITY ERROR: DATABASE_URL environment variable is required in production');
  }
  
  // Validate JWT_SECRET strength in production
  if (isProduction && process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    throw new Error('SECURITY ERROR: JWT_SECRET must be at least 32 characters long in production');
  }
}

// Run validation immediately
validateEnvironment();

// JWT Secret with proper fallback for development only
const JWT_SECRET = process.env.JWT_SECRET || 
  (process.env.NODE_ENV === 'production' 
    ? (() => { throw new Error('JWT_SECRET is required in production'); })() 
    : 'dev-jwt-secret-32-chars-minimum-length!');
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '30d';

// Deployment timestamp - invalidates all tokens from previous deployments
const DEPLOYMENT_TIMESTAMP = Date.now();
console.log(`[Auth] Deployment timestamp: ${DEPLOYMENT_TIMESTAMP} (${new Date(DEPLOYMENT_TIMESTAMP).toISOString()})`);

// Generate JWT tokens
export function generateTokens(user: { id: string; email: string; name: string }) {
  const accessToken = jwt.sign(
    { 
      id: user.id, 
      email: user.email, 
      name: user.name,
      deploymentTimestamp: DEPLOYMENT_TIMESTAMP
    },
    JWT_SECRET,
    { 
      expiresIn: JWT_EXPIRES_IN,
      issuer: 'flowhub-app',
      audience: 'flowhub-users'
    }
  );

  const refreshToken = jwt.sign(
    { 
      id: user.id, 
      type: 'refresh',
      deploymentTimestamp: DEPLOYMENT_TIMESTAMP
    },
    JWT_SECRET,
    { 
      expiresIn: REFRESH_TOKEN_EXPIRES_IN,
      issuer: 'flowhub-app',
      audience: 'flowhub-users'
    }
  );

  return { accessToken, refreshToken };
}

// Verify JWT token
export function verifyToken(token: string): any {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'flowhub-app',
      audience: 'flowhub-users'
    });
    
    // Check if token is from current deployment
    if (typeof decoded === 'object' && decoded !== null) {
      if (!decoded.deploymentTimestamp || decoded.deploymentTimestamp !== DEPLOYMENT_TIMESTAMP) {
        console.log(`[Auth] Token rejected: deployment mismatch (token: ${decoded.deploymentTimestamp}, current: ${DEPLOYMENT_TIMESTAMP})`);
        return null;
      }
    }
    
    return decoded;
  } catch (error) {
    return null;
  }
}

// Hash password
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
}

// Verify password
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Authentication middleware
export function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  // Try to get token from Authorization header first
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  // If no header token, try to get from HTTP-only cookie
  if (!token) {
    token = req.cookies?.accessToken;
  }

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    // Check if token was rejected due to deployment mismatch
    const tokenPayload = jwt.decode(token);
    if (tokenPayload && typeof tokenPayload === 'object' && tokenPayload.deploymentTimestamp && tokenPayload.deploymentTimestamp !== DEPLOYMENT_TIMESTAMP) {
      return res.status(403).json({ 
        message: 'Session invalidated due to app update',
        reason: 'deployment_update'
      });
    }
    return res.status(403).json({ message: 'Invalid or expired token' });
  }

  // Check if it's a refresh token (should not be used for API access)
  if (decoded.type === 'refresh') {
    return res.status(403).json({ message: 'Invalid token type' });
  }

  req.user = {
    id: decoded.id,
    email: decoded.email,
    name: decoded.name
  };

  next();
}

// Optional authentication middleware (doesn't fail if no token)
export function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    token = req.cookies?.accessToken;
  }

  if (token) {
    const decoded = verifyToken(token);
    if (decoded && decoded.type !== 'refresh') {
      req.user = {
        id: decoded.id,
        email: decoded.email,
        name: decoded.name
      };
    }
  }

  next();
}

// Set secure HTTP-only cookies
export function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Access token cookie (shorter expiry)
  res.cookie('accessToken', accessToken, {
    httpOnly: true,
    secure: isProduction, // Only send over HTTPS in production
    sameSite: isProduction ? 'strict' : 'lax', // More flexible in dev
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
    path: '/'
  });

  // Refresh token cookie (longer expiry)
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days in milliseconds
    path: '/auth' // Only send to auth endpoints
  });
}

// Clear auth cookies
export function clearAuthCookies(res: Response) {
  res.clearCookie('accessToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/'
  });
  
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/auth'
  });
}

// Rate limiting for auth endpoints
const authAttempts = new Map<string, { count: number; lastAttempt: number }>();

export function rateLimitAuth(maxAttempts: number = 5, windowMs: number = 15 * 60 * 1000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    
    const attempts = authAttempts.get(ip);
    
    if (attempts) {
      // Reset if window has passed
      if (now - attempts.lastAttempt > windowMs) {
        authAttempts.delete(ip);
      } else if (attempts.count >= maxAttempts) {
        return res.status(429).json({ 
          message: 'Too many authentication attempts. Please try again later.',
          retryAfter: Math.ceil((windowMs - (now - attempts.lastAttempt)) / 1000)
        });
      }
    }
    
    next();
  };
}

// Track failed auth attempts
export function trackFailedAuth(ip: string) {
  const now = Date.now();
  const attempts = authAttempts.get(ip);
  
  if (attempts) {
    attempts.count++;
    attempts.lastAttempt = now;
  } else {
    authAttempts.set(ip, { count: 1, lastAttempt: now });
  }
}

// Session cleanup for expired tokens
export function cleanupExpiredSessions() {
  // This would typically clean up a session store
  // For JWT tokens, they're stateless and expire automatically
  console.log('[Auth] Cleaned up expired sessions');
}

// Start periodic cleanup
setInterval(cleanupExpiredSessions, 60 * 60 * 1000); // Every hour
