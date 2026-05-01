// ═══════════════════════════════════════════════════════════════
// TICKRIX WAITLIST API
// ═══════════════════════════════════════════════════════════════
// Vercel Serverless Function — Path: /api/waitlist
//
// Flow:
//   1. Receive { name, email } from homepage form
//   2. Save to Supabase (uses honest sequential position)
//   3. Send cream-paper certificate email via Resend
//   4. Return { success, position, name } to frontend
// ═══════════════════════════════════════════════════════════════

const SUPABASE_URL = 'https://cagrwqhmsnqgqusvmmnw.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = 'Tickrix <hello@tickrix.com>';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(200).end();
  }
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { name, email } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email is required' });
    }
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim().slice(0, 60);

    const supabaseResponse = await fetch(`${SUPABASE_URL}/rest/v1/waitlist`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({ name: cleanName, email: cleanEmail, source: 'website' }),
    });

    let position;
    let storedName = cleanName;
    let signedUpAt = new Date();
    let isExisting = false;

    if (supabaseResponse.status === 409 || supabaseResponse.status === 400) {
      const lookupResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/waitlist?email=eq.${encodeURIComponent(cleanEmail)}&select=name,position,signed_up_at`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          },
        }
      );
      const existing = await lookupResponse.json();
      if (existing && existing[0]) {
        position = existing[0].position;
        storedName = existing[0].name || cleanName;
        signedUpAt = new Date(existing[0].signed_up_at);
        isExisting = true;
      } else {
        throw new Error('Email exists but lookup failed');
      }
    } else if (!supabaseResponse.ok) {
      const errorText = await supabaseResponse.text();
      console.error('Supabase error:', errorText);
      throw new Error(`Supabase error: ${supabaseResponse.status}`);
    } else {
      const data = await supabaseResponse.json();
      position = data[0].position;
      storedName = data[0].name || cleanName;
      signedUpAt = new Date(data[0].signed_up_at || Date.now());
    }

    if (!isExisting) {
      const emailHtml = generateCertificateEmail(storedName, position, signedUpAt, cleanEmail);
      const padded = String(position).padStart(3, '0');

      const resendResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: cleanEmail,
          subject: `Your reservation: №${padded}`,
          html: emailHtml,
        }),
      });

      if (!resendResponse.ok) {
        const errorText = await resendResponse.text();
        console.error('Resend error:', errorText);
      }
    }

    return res.status(200).json({
      success: true,
      position,
      name: storedName,
      signed_up_at: signedUpAt.toISOString(),
      existing: isExisting,
    });

  } catch (error) {
    console.error('Waitlist error:', error);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}

function generateCertificateEmail(name, position, dateObj, email) {
  const padded = String(position).padStart(3, '0');
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const dateStr = `${dateObj.getDate()} ${months[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
  const certId = `TX-CERT-${padded}`;
  const encodedEmail = encodeURIComponent(email);
  const safeName = escapeHtml(name);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<title>Your reservation: №${padded}</title>
<style>
  body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
  body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
  table { border-collapse: collapse !important; }
  @media screen and (max-width: 600px) {
    .container { width: 100% !important; max-width: 100% !important; }
    .px-pad { padding-left: 24px !important; padding-right: 24px !important; }
    .cert-num { font-size: 110px !important; }
    .cert-name { font-size: 24px !important; }
    .meta-cell { padding: 12px 6px !important; font-size: 11px !important; }
    .meta-label-mobile { font-size: 9px !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background-color:#0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif;">

<div style="display:none; font-size:1px; color:#0a0a0a; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden;">
You are №${padded} on the Tickrix waitlist. Edition One ships Q3 2026.
</div>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#0a0a0a;">
  <tr><td align="center" style="padding:32px 16px;">

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="container" width="600" style="max-width:600px; width:100%;">

      <tr><td align="center" style="padding:0 0 24px 0;">
        <p style="margin:0; font-family: -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif; font-size:11px; color:#888780; letter-spacing:0.3em; text-transform:uppercase; font-weight:700;">
          — Your reservation is confirmed
        </p>
      </td></tr>

      <tr><td style="background-color:#F0EAD6; border:1.5px solid #2C2620; padding:0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">

          <tr><td class="px-pad" style="padding:32px 40px 18px 40px; border-bottom:1.5px solid #C8BFA0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
              <td align="left" style="font-family: -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif; font-size:11px; letter-spacing:0.18em; color:#2C2620; text-transform:uppercase; font-weight:700;">
                ${certId} / RESERVATION
              </td>
              <td align="right" style="font-family: -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif; font-size:11px; letter-spacing:0.18em; color:#2C2620; text-transform:uppercase; font-weight:700;">
                EDITION ONE · Q3 2026
              </td>
            </tr></table>
          </td></tr>

          <tr><td class="px-pad" align="center" style="padding:32px 40px 16px 40px;">
            <p style="margin:0; font-family: -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif; font-size:11px; letter-spacing:0.3em; color:#8C5A1F; text-transform:uppercase; font-weight:700;">
              — RESERVED FOR
            </p>
          </td></tr>

          <tr><td class="px-pad" align="center" style="padding:0 40px 24px 40px;">
            <p class="cert-name" style="margin:0; font-family: Georgia, 'Times New Roman', serif; font-size:32px; font-style:italic; color:#2C2620; font-weight:700; letter-spacing:-0.01em; line-height:1;">
              ${safeName}
            </p>
          </td></tr>

          <tr><td class="px-pad" align="center" style="padding:0 40px 20px 40px;">
            <p class="cert-num" style="margin:0; font-family: Georgia, 'Times New Roman', serif; font-size:160px; font-weight:700; font-style:italic; color:#2C2620; line-height:0.85; letter-spacing:-0.05em;">
              <span style="font-style:normal; color:#8C5A1F; font-size:0.35em; vertical-align:0.5em; margin-right:4px; font-weight:500;">№</span>${padded}
            </p>
          </td></tr>

          <tr><td class="px-pad" align="center" style="padding:0 40px 28px 40px;">
            <p style="margin:0; font-family: Georgia, 'Times New Roman', serif; font-size:18px; font-style:italic; color:#2C2620; line-height:1.5; font-weight:500;">
              One number. Reserved once. Yours.
            </p>
          </td></tr>

          <tr><td class="px-pad" style="padding:0 40px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td class="meta-cell" align="center" valign="top" width="33%" style="padding:0 12px;">
                  <p class="meta-label-mobile" style="margin:0 0 6px 0; font-family: -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif; font-size:10px; letter-spacing:0.22em; color:#8C5A1F; text-transform:uppercase; font-weight:700;">RESERVED</p>
                  <p style="margin:0; font-family: -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif; font-size:14px; color:#2C2620; font-weight:700;">${dateStr}</p>
                </td>
                <td class="meta-cell" align="center" valign="top" width="33%" style="padding:0 12px; border-left:1px solid #C8BFA0; border-right:1px solid #C8BFA0;">
                  <p class="meta-label-mobile" style="margin:0 0 6px 0; font-family: -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif; font-size:10px; letter-spacing:0.22em; color:#8C5A1F; text-transform:uppercase; font-weight:700;">SHIPS</p>
                  <p style="margin:0; font-family: -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif; font-size:14px; color:#2C2620; font-weight:700;">Q3 2026</p>
                </td>
                <td class="meta-cell" align="center" valign="top" width="33%" style="padding:0 12px;">
                  <p class="meta-label-mobile" style="margin:0 0 6px 0; font-family: -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif; font-size:10px; letter-spacing:0.22em; color:#8C5A1F; text-transform:uppercase; font-weight:700;">PRICE</p>
                  <p style="margin:0; font-family: -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif; font-size:14px; color:#2C2620; font-weight:700;">Locked</p>
                </td>
              </tr>
            </table>
          </td></tr>

          <tr><td class="px-pad" style="padding:32px 40px; border-top:1.5px solid #C8BFA0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
              <td align="left" style="font-family: Georgia, 'Times New Roman', serif; font-size:16px; font-style:italic; color:#2C2620; font-weight:700;">
                Built once. Built for you.
              </td>
              <td align="right" style="font-family: -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif; font-size:24px; font-weight:800; color:#2C2620; letter-spacing:-0.02em; line-height:1;">
                Tickrix<sup style="font-size:10px; vertical-align:super; font-weight:700;">&trade;</sup>
              </td>
            </tr></table>
          </td></tr>

        </table>
      </td></tr>

      <tr><td style="padding:48px 0 0 0;" align="center">
        <p style="margin:0; font-family: -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif; font-size:11px; color:#888780; letter-spacing:0.3em; text-transform:uppercase; font-weight:700;">
          — A quick favor, if you have 30 seconds
        </p>
      </td></tr>

      <tr><td class="px-pad" style="padding:24px 40px 0 40px;">
        <p style="margin:0 0 16px 0; font-family: Georgia, 'Times New Roman', serif; font-size:18px; line-height:1.6; color:#E8E6E0; font-weight:400;">
          Tickrix isn't being built by a team in a boardroom. It's being shaped, in real time, by the first people on this list.
        </p>
        <p style="margin:0; font-family: -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif; font-size:15px; line-height:1.7; color:#888780;">
          If you have a moment, just hit reply and tell us:
        </p>
      </td></tr>

      <tr><td class="px-pad" style="padding:24px 40px 0 40px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td style="padding:14px 18px; border-left:2px solid #E8A14D;">
            <p style="margin:0; font-family: Georgia, 'Times New Roman', serif; font-size:16px; line-height:1.5; color:#E8E6E0; font-style:italic;">
              What markets do you trade most?
            </p>
          </td></tr>
        </table>
      </td></tr>

      <tr><td class="px-pad" style="padding:12px 40px 0 40px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td style="padding:14px 18px; border-left:2px solid #E8A14D;">
            <p style="margin:0; font-family: Georgia, 'Times New Roman', serif; font-size:16px; line-height:1.5; color:#E8E6E0; font-style:italic;">
              What's missing from your trading desk right now?
            </p>
          </td></tr>
        </table>
      </td></tr>

      <tr><td class="px-pad" style="padding:12px 40px 0 40px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td style="padding:14px 18px; border-left:2px solid #E8A14D;">
            <p style="margin:0; font-family: Georgia, 'Times New Roman', serif; font-size:16px; line-height:1.5; color:#E8E6E0; font-style:italic;">
              What price feels right for a device like this?
            </p>
          </td></tr>
        </table>
      </td></tr>

      <tr><td class="px-pad" style="padding:24px 40px 0 40px;">
        <p style="margin:0; font-family: -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif; font-size:14px; line-height:1.6; color:#6E6C66; font-style:italic;">
          We read every reply, personally.
        </p>
      </td></tr>

      <tr><td class="px-pad" align="center" style="padding:56px 40px 16px 40px;">
        <p style="margin:0 0 12px 0; font-family: -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif; font-size:14px; font-weight:800; color:#FFFFFF; letter-spacing:-0.02em;">
          Tickrix<sup style="font-size:9px; color:#888780; font-weight:700;">&trade;</sup>
        </p>
        <p style="margin:0 0 16px 0; font-family: Georgia, 'Times New Roman', serif; font-style:italic; font-size:13px; color:#888780;">
          Designed and assembled in Rotterdam, NL
        </p>
        <p style="margin:0 0 6px 0; font-family: -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif; font-size:11px; color:#525258; line-height:1.6;">
          <a href="https://tickrix.com" style="color:#E8A14D; text-decoration:none;">tickrix.com</a> &middot; <a href="mailto:hello@tickrix.com" style="color:#E8A14D; text-decoration:none;">hello@tickrix.com</a> &middot; <a href="https://x.com/tickrix" style="color:#E8A14D; text-decoration:none;">@tickrix</a>
        </p>
        <p style="margin:0; font-family: -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif; font-size:11px; color:#525258; line-height:1.6;">
          You received this because you reserved №${padded} at tickrix.com.<br>
          <a href="https://tickrix.com/unsubscribe?email=${encodedEmail}" style="color:#888780; text-decoration:underline;">Unsubscribe</a> &middot; &copy; 2026 Tickrix
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
