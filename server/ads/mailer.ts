/**
 * Sends plain-text email over SMTP (e.g. Gmail with an app password). In
 * local development without SMTP settings, emails are appended to
 * data/outbox.log instead so the flow can be tested.
 */
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import nodemailer from 'nodemailer';

export interface MailEnv {
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  EMAIL_FROM?: string;
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}

export async function sendMail(mail: Mail, env: MailEnv): Promise<boolean> {
  const host = env.SMTP_HOST?.trim();
  if (host && env.SMTP_USER && env.SMTP_PASS) {
    const port = Number(env.SMTP_PORT) || 465;
    try {
      const transport = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      });
      await transport.sendMail({
        from: env.EMAIL_FROM?.trim() || `Kya Dekhu <${env.SMTP_USER}>`,
        to: mail.to,
        replyTo: mail.replyTo,
        subject: mail.subject,
        text: mail.text,
      });
      return true;
    } catch (err) {
      console.error('[mail] send failed:', (err as Error).message);
      return false;
    }
  }

  if (process.env.VERCEL) {
    console.error('[mail] SMTP is not configured; email not sent:', mail.subject);
    return false;
  }
  const entry = `--- ${new Date().toISOString()}\nTo: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n\n`;
  console.log(`[mail:dev] ${mail.subject} -> ${mail.to}`);
  try {
    await mkdir(join(process.cwd(), 'data'), { recursive: true });
    await appendFile(join(process.cwd(), 'data', 'outbox.log'), entry, 'utf8');
  } catch {
    /* logging only */
  }
  return true;
}
