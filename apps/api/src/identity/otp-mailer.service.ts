import { type ApiEnvironment } from '@bsbe/config';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

@Injectable()
export class OtpMailerService {
  private readonly transporter: Transporter;

  constructor(private readonly config: ConfigService<ApiEnvironment, true>) {
    const user = config.get('SMTP_USER', { infer: true });
    const password = config.get('SMTP_PASSWORD', { infer: true });
    this.transporter = nodemailer.createTransport({
      host: config.get('SMTP_HOST', { infer: true }),
      port: config.get('SMTP_PORT', { infer: true }),
      secure: config.get('SMTP_SECURE', { infer: true }),
      auth: user && password ? { user, pass: password } : undefined,
      pool: true,
      maxConnections: 3,
      connectionTimeout: 5_000,
      socketTimeout: 8_000,
    });
  }

  async sendLoginOtp(to: string, otp: string, expiresInSeconds: number): Promise<void> {
    const minutes = Math.ceil(expiresInSeconds / 60);
    await this.transporter.sendMail({
      from: this.config.get('SMTP_FROM', { infer: true }),
      to,
      subject: 'Your BSBE portal verification code',
      text: [
        `Your BSBE Placement Mock Test Portal verification code is ${otp}.`,
        `It expires in ${minutes} minute${minutes === 1 ? '' : 's'} and can be used once.`,
        'If you did not request this code, you can ignore this message.',
      ].join('\n\n'),
    });
  }

  async sendAuthenticationNotice(to: string): Promise<void> {
    await this.transporter.sendMail({
      from: this.config.get('SMTP_FROM', { infer: true }),
      to,
      subject: 'BSBE portal sign-in completed',
      text: [
        'A sign-in to your BSBE Placement Mock Test Portal account was completed.',
        'If this was not you, contact the department administrator immediately. This message contains no verification code or session information.',
      ].join('\n\n'),
    });
  }

  async sendNotification(to: string, subject: string, message: string): Promise<void> {
    await this.transporter.sendMail({
      from: this.config.get('SMTP_FROM', { infer: true }),
      to,
      subject,
      text: message,
    });
  }
}
