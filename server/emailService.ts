
import nodemailer from 'nodemailer';

interface EmailConfig {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

class EmailService {
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    const smtpUser = process.env.SMTP_USER;
    const smtpPassword = process.env.GMAIL_APP_PASSWORD;

    if (!smtpUser || !smtpPassword) {
      console.log('[EmailService] SMTP credentials not configured - email sending disabled');
      return;
    }

    try {
      this.transporter = nodemailer.createTransporter({
        service: 'gmail',
        auth: {
          user: smtpUser,
          pass: smtpPassword,
        },
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
        rateDelta: 1000,
        rateLimit: 5,
        connectionTimeout: 10000,
        greetingTimeout: 5000,
        socketTimeout: 10000,
      });

      console.log('[EmailService] SMTP transporter initialized successfully');
    } catch (error) {
      console.error('[EmailService] Failed to initialize SMTP transporter:', error);
      this.transporter = null;
    }
  }

  async sendEmail(config: EmailConfig): Promise<boolean> {
    if (!this.transporter) {
      console.log('[EmailService] No transporter available - skipping email send');
      return false;
    }

    try {
      const mailOptions = {
        from: process.env.SMTP_USER,
        to: config.to,
        subject: config.subject,
        text: config.text,
        html: config.html,
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('[EmailService] Email sent successfully:', result.messageId);
      return true;
    } catch (error) {
      console.error('[EmailService] Failed to send email:', error);
      return false;
    }
  }

  async sendWaitlistEmail(email: string): Promise<boolean> {
    return this.sendEmail({
      to: process.env.SMTP_USER || 'admin@flowhub.com',
      subject: 'New Waitlist Signup - FlowHub',
      html: `
        <h2>New Waitlist Signup</h2>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
        <p>This user has requested access to FlowHub premium features.</p>
      `,
      text: `New waitlist signup: ${email} at ${new Date().toISOString()}`
    });
  }

  async sendFeedbackEmail(name: string, email: string, message: string): Promise<boolean> {
    return this.sendEmail({
      to: process.env.SMTP_USER || 'feedback@flowhub.com',
      subject: 'New Feedback - FlowHub',
      html: `
        <h2>New Feedback Received</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Message:</strong></p>
        <p>${message.replace(/\n/g, '<br>')}</p>
        <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
      `,
      text: `Feedback from ${name} (${email}):\n\n${message}\n\nSent at: ${new Date().toISOString()}`
    });
  }

  // Test email connectivity
  async testConnection(): Promise<boolean> {
    if (!this.transporter) {
      return false;
    }

    try {
      await this.transporter.verify();
      console.log('[EmailService] SMTP connection verified successfully');
      return true;
    } catch (error) {
      console.error('[EmailService] SMTP connection test failed:', error);
      return false;
    }
  }
}

export const emailService = new EmailService();
