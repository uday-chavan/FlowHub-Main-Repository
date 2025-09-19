import { createCipherGCM, createDecipherGCM, randomBytes } from 'crypto';
import { storage } from './storage';

// Encryption service for Gmail OAuth tokens
class TokenEncryption {
  private readonly algorithm = 'aes-256-gcm';
  private readonly secretKey: Buffer;

  constructor() {
    // Use a secure secret from environment or generate one
    const keyString = process.env.TOKEN_ENCRYPTION_KEY || this.generateSecureKey();
    this.secretKey = keyString.length === 64 ? Buffer.from(keyString, 'hex') : Buffer.from(keyString).subarray(0, 32);
  }

  private generateSecureKey(): string {
    return randomBytes(32).toString('hex');
  }

  encrypt(plaintext: string): { encrypted: string; iv: string; authTag: string } {
    const iv = randomBytes(16);
    const cipher = createCipherGCM(this.algorithm, this.secretKey, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag().toString('hex');
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag
    };
  }

  decrypt(encryptedData: { encrypted: string; iv: string; authTag: string }): string {
    const decipher = createDecipherGCM(this.algorithm, this.secretKey, Buffer.from(encryptedData.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
    
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}

// Secure token storage service
export class SecureTokenStorage {
  private encryption = new TokenEncryption();

  async storeGmailTokens(userId: string, tokens: any, userEmail: string): Promise<void> {
    try {
      const tokenString = JSON.stringify({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expiry_date,
        token_type: tokens.token_type || 'Bearer',
        scope: tokens.scope
      });

      const encryptedData = this.encryption.encrypt(tokenString);
      
      // Store encrypted tokens in database
      const encryptedTokenBlob = JSON.stringify({
        encrypted: encryptedData.encrypted,
        iv: encryptedData.iv,
        authTag: encryptedData.authTag,
        userEmail,
        createdAt: new Date().toISOString()
      });

      // Store in database (we'll add this to schema)
      await storage.storeEncryptedGmailTokens(userId, encryptedTokenBlob);
      
    } catch (error) {
      console.error('[TokenStorage] Failed to store Gmail tokens:', error);
      throw new Error('Failed to store encrypted tokens');
    }
  }

  async retrieveGmailTokens(userId: string): Promise<{ tokens: any; userEmail: string } | null> {
    try {
      const encryptedBlob = await storage.getEncryptedGmailTokens(userId);
      if (!encryptedBlob) return null;

      const encryptedData = JSON.parse(encryptedBlob);
      const decryptedTokenString = this.encryption.decrypt({
        encrypted: encryptedData.encrypted,
        iv: encryptedData.iv,
        authTag: encryptedData.authTag
      });

      const tokens = JSON.parse(decryptedTokenString);
      
      return {
        tokens,
        userEmail: encryptedData.userEmail
      };
    } catch (error) {
      console.error('[TokenStorage] Failed to retrieve Gmail tokens:', error);
      return null;
    }
  }

  async deleteGmailTokens(userId: string): Promise<void> {
    try {
      await storage.deleteEncryptedGmailTokens(userId);
    } catch (error) {
      console.error('[TokenStorage] Failed to delete Gmail tokens:', error);
      throw new Error('Failed to delete encrypted tokens');
    }
  }
}

export const secureTokenStorage = new SecureTokenStorage();