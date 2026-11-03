// Vercel serverless function for the advertiser enquiry form.
import { handleEnquiry } from '../server/enquiry';

export async function POST(request: Request): Promise<Response> {
  const text = await request.text();
  if (text.length > 20_000) return Response.json({ error: 'too_large' }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  const result = await handleEnquiry(body, ip, {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    ENQUIRY_TO_EMAIL: process.env.ENQUIRY_TO_EMAIL,
    ENQUIRY_FROM_EMAIL: process.env.ENQUIRY_FROM_EMAIL,
  });
  return new Response(result.body, { status: result.status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
