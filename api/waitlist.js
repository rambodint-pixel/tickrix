// ═══════════════════════════════════════════════════════════════
// TICKRIX WAITLIST API
// ═══════════════════════════════════════════════════════════════
// Vercel Serverless Function
// Path: /api/waitlist
//
// Flow:
// 1. Receive email from homepage form
// 2. Save to Supabase waitlist table
// 3. Get position number from Supabase
// 4. Send premium welcome email via Resend
// 5. Return success with position to frontend
// ═══════════════════════════════════════════════════════════════

const SUPABASE_URL = 'https://cagrwqhmsnqgqusvmmnw.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = 'Tickrix <hello@tickrix.com>';

// CORS headers for the API
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req, res) {
  // ─── CORS preflight ───────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    Object.entries(CORS_HEADERS).forEach(([key, value]) => res.setHeader(key, value));
    return res.status(200).end();
  }

  // Apply CORS to all responses
  Object.entries(CORS_HEADERS).forEach(([key, value]) => res.setHeader(key, value));

  // ─── Method check ─────────────────────────────────────────────
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // ─── Parse & validate email ─────────────────────────────────
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email is required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const cleanEmail = email.trim().toLowerCase();

    // ─── Save to Supabase ───────────────────────────────────────
    const supabaseResponse = await fetch(`${SUPABASE_URL}/rest/v1/waitlist`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({ email: cleanEmail }),
    });

    let position;
    let isExisting = false;

    if (supabaseResponse.status === 409 || supabaseResponse.status === 400) {
      // Email already exists - look it up to get their position
      const lookupResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/waitlist?email=eq.${encodeURIComponent(cleanEmail)}&select=id`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          },
        }
      );
      const existing = await lookupResponse.json();
      if (existing && existing[0]) {
        position = existing[0].id + 800;
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
      position = data[0].id + 800;
    }

    // ─── If existing user, return without resending email ──────
    if (isExisting) {
      return res.status(200).json({
        success: true,
        position,
        message: 'You are already on the list',
        existing: true,
      });
    }

    // ─── Send welcome email via Resend ──────────────────────────
    const emailHtml = generateWelcomeEmail(position, cleanEmail);

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: cleanEmail,
        subject: `Reserved: №${position}.`,
        html: emailHtml,
      }),
    });

    if (!resendResponse.ok) {
      const errorText = await resendResponse.text();
      console.error('Resend error:', errorText);
      // Don't fail the whole request - email failure is non-critical
      // User is already on the waitlist
    }

    // ─── Success ───────────────────────────────────────────────
    return res.status(200).json({
      success: true,
      position,
      message: 'Welcome to Tickrix',
    });

  } catch (error) {
    console.error('Waitlist error:', error);
    return res.status(500).json({
      error: 'Something went wrong. Please try again.',
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// EMAIL TEMPLATE GENERATOR
// ═══════════════════════════════════════════════════════════════

function generateWelcomeEmail(position, email) {
  const encodedEmail = encodeURIComponent(email);

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>Reserved: №${position}.</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<![endif]-->
<style>
  body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
  img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
  body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
  table { border-collapse: collapse !important; }
  @media screen and (max-width: 600px) {
    .container { width: 100% !important; max-width: 100% !important; }
    .px-48 { padding-left: 24px !important; padding-right: 24px !important; }
    .py-48 { padding-top: 32px !important; padding-bottom: 32px !important; }
    .py-64 { padding-top: 48px !important; padding-bottom: 48px !important; }
    .hero-number { font-size: 80px !important; }
    .hero-title { font-size: 22px !important; }
    .body-h2 { font-size: 20px !important; }
    .question-text { font-size: 17px !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background-color:#f5f3ee; font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif;">
<div style="display:none; font-size:1px; color:#f5f3ee; line-height:1px; max-height:0px; max-width:0px; opacity:0; overflow:hidden;">
You're №${position} on the Tickrix waitlist. Q3 2026. Crafted in Rotterdam.
</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f5f3ee;">
  <tr><td align="center" style="padding:24px 16px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="container" width="600" style="max-width:600px; width:100%;">
      <tr><td style="background-color:#0a0a0c; border-radius:8px 8px 0 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#050506; border-bottom:1px solid #1a1a1d;">
          <tr><td style="font-family:'Courier New',monospace; font-size:10px; padding:14px 24px; text-align:center; color:#8a8a92; letter-spacing:0.18em;">
            <span style="color:#c9a96e;">BTC</span><span style="color:#3a3a3d; padding:0 8px;">·</span>
            <span style="color:#c9a96e;">ETH</span><span style="color:#3a3a3d; padding:0 8px;">·</span>
            <span style="color:#c9a96e;">EUR/USD</span><span style="color:#3a3a3d; padding:0 8px;">·</span>
            <span style="color:#c9a96e;">GOLD</span><span style="color:#3a3a3d; padding:0 8px;">·</span>
            <span style="color:#c9a96e;">SPX</span><span style="color:#3a3a3d; padding:0 8px;">·</span>
            <span style="color:#c9a96e;">+ 10K</span>
          </td></tr>
        </table>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td class="px-48" style="padding:32px 48px 0 48px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
              <td align="left" style="font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif; font-size:14px; font-weight:700; color:#ffffff; letter-spacing:0.02em;">
                Tickrix<sup style="font-size:9px; color:#8a8a92; font-weight:400;">®</sup>
              </td>
              <td align="right" style="font-family:'Courier New',monospace; font-size:10px; color:#34d399; letter-spacing:0.18em; text-transform:uppercase; font-weight:600;">
                ● Live
              </td>
            </tr></table>
          </td></tr>
        </table>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td class="py-64 px-48" align="center" style="padding:64px 48px 56px 48px;">
            <p style="margin:0 0 24px 0; font-family:'Courier New',monospace; font-size:11px; color:#c9a96e; letter-spacing:0.18em; text-transform:uppercase;">— Your spot is reserved —</p>
            <p class="hero-number" style="margin:0; font-family:Georgia,'Times New Roman',serif; font-size:104px; font-weight:400; line-height:1; letter-spacing:-0.04em; color:#c9a96e; font-style:italic;">№${position}</p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:32px auto;"><tr><td width="48" height="1" style="background-color:#8c754c; line-height:1px; font-size:1px;">&nbsp;</td></tr></table>
            <p class="hero-title" style="margin:0 0 12px 0; font-family:Georgia,'Times New Roman',serif; font-size:26px; font-weight:400; line-height:1.3; color:#ffffff; letter-spacing:-0.01em;">Welcome to <em style="color:#c9a96e; font-style:italic;">Tickrix.</em></p>
            <p style="margin:0; font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif; font-size:14px; line-height:1.6; color:#8a8a92;">For traders who take it seriously.</p>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="background-color:#ffffff;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td class="py-48 px-48" style="padding:48px 48px 0 48px;">
            <p style="margin:0 0 20px 0; font-family:Georgia,'Times New Roman',serif; font-size:22px; line-height:1.5; color:#1a1a1d; font-weight:400; letter-spacing:-0.01em;">You're in.</p>
            <p style="margin:0 0 16px 0; font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif; font-size:16px; line-height:1.7; color:#3a3a3d;">Thank you for joining the Tickrix waitlist. You're now <strong style="color:#1a1a1d;">№${position}</strong> in line for the first batch — shipping <strong style="color:#1a1a1d;">Q3 2026</strong>.</p>
            <p style="margin:0; font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif; font-size:16px; line-height:1.7; color:#3a3a3d;">We're crafting a new kind of market display — quiet, beautiful, considered. Designed in Rotterdam, built for traders who care how things are made.</p>
          </td></tr>
        </table>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td class="px-48" style="padding:40px 48px 0 48px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td height="1" style="background-color:#e5e3de; line-height:1px; font-size:1px;">&nbsp;</td></tr></table></td></tr></table>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td class="px-48" style="padding:40px 48px 0 48px;">
            <p style="margin:0 0 8px 0; font-family:'Courier New',monospace; font-size:11px; color:#c9a96e; letter-spacing:0.18em; text-transform:uppercase;">— 01 What happens next</p>
            <p class="body-h2" style="margin:0 0 28px 0; font-family:Georgia,'Times New Roman',serif; font-size:24px; line-height:1.3; color:#1a1a1d; font-weight:400; letter-spacing:-0.01em;">The road to <em style="color:#c9a96e; font-style:italic;">Q3 2026.</em></p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr><td width="100" valign="top" style="padding:14px 16px 14px 0;"><span style="display:inline-block; background-color:#34d399; color:#0a0a0c; font-family:'Courier New',monospace; font-size:10px; font-weight:700; letter-spacing:0.1em; padding:5px 10px; border-radius:3px;">● NOW</span></td>
              <td valign="top" style="font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif; font-size:15px; line-height:1.6; color:#3a3a3d; padding:14px 0; border-bottom:1px solid #f0eee9;">You're on the list. We'll send periodic build updates — <strong style="color:#1a1a1d;">no spam, ever.</strong></td></tr>
              <tr><td width="100" valign="top" style="padding:14px 16px 14px 0;"><span style="display:inline-block; background-color:#fef3e2; color:#8c6a1a; font-family:'Courier New',monospace; font-size:10px; font-weight:700; letter-spacing:0.1em; padding:5px 10px; border-radius:3px; border:1px solid #f5e0b3;">Q2 2026</span></td>
              <td valign="top" style="font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif; font-size:15px; line-height:1.6; color:#3a3a3d; padding:14px 0; border-bottom:1px solid #f0eee9;">Final manufacturing samples. We'll share photos, videos, behind-the-scenes from production.</td></tr>
              <tr><td width="100" valign="top" style="padding:14px 16px 14px 0;"><span style="display:inline-block; background-color:#c9a96e; color:#0a0a0c; font-family:'Courier New',monospace; font-size:10px; font-weight:700; letter-spacing:0.1em; padding:5px 10px; border-radius:3px;">✦ Q3 2026</span></td>
              <td valign="top" style="font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif; font-size:15px; line-height:1.6; color:#3a3a3d; padding:14px 0;"><strong style="color:#1a1a1d;">First batch ships.</strong> You'll get the email before anyone else, with priority access to reserve your unit.</td></tr>
            </table>
          </td></tr>
        </table>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td class="px-48" style="padding:40px 48px 0 48px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td height="1" style="background-color:#e5e3de; line-height:1px; font-size:1px;">&nbsp;</td></tr></table></td></tr></table>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td class="px-48" style="padding:40px 48px 0 48px;">
            <p style="margin:0 0 8px 0; font-family:'Courier New',monospace; font-size:11px; color:#c9a96e; letter-spacing:0.18em; text-transform:uppercase;">— 02 Tell us about you</p>
            <p class="body-h2" style="margin:0 0 16px 0; font-family:Georgia,'Times New Roman',serif; font-size:24px; line-height:1.3; color:#1a1a1d; font-weight:400; letter-spacing:-0.01em;">You're shaping <em style="color:#c9a96e; font-style:italic;">what we build.</em></p>
            <p style="margin:0 0 24px 0; font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif; font-size:15px; line-height:1.7; color:#3a3a3d;">Tickrix isn't being built in a boardroom. It's being shaped — quietly, in real time — by traders like you. The first 1,000 people on this list have direct influence on the final product.</p>
            <p style="margin:0 0 32px 0; font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif; font-size:15px; line-height:1.7; color:#3a3a3d;">Hit reply to this email and tell us:</p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:14px;"><tr><td style="background-color:#faf8f3; border-left:3px solid #c9a96e; padding:18px 24px; border-radius:0 6px 6px 0;"><p style="margin:0 0 4px 0; font-family:'Courier New',monospace; font-size:10px; color:#8c754c; letter-spacing:0.15em; text-transform:uppercase; font-weight:700;">● Question 01</p><p class="question-text" style="margin:0; font-family:Georgia,'Times New Roman',serif; font-size:18px; line-height:1.4; color:#1a1a1d; font-weight:400;">What markets do you trade <em style="color:#8c754c; font-style:italic;">most often?</em></p></td></tr></table>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:14px;"><tr><td style="background-color:#f3faf6; border-left:3px solid #34d399; padding:18px 24px; border-radius:0 6px 6px 0;"><p style="margin:0 0 4px 0; font-family:'Courier New',monospace; font-size:10px; color:#1a8855; letter-spacing:0.15em; text-transform:uppercase; font-weight:700;">● Question 02</p><p class="question-text" style="margin:0; font-family:Georgia,'Times New Roman',serif; font-size:18px; line-height:1.4; color:#1a1a1d; font-weight:400;">What's <em style="color:#1a8855; font-style:italic;">missing</em> from your trading desk right now?</p></td></tr></table>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:14px;"><tr><td style="background-color:#f5f3fa; border-left:3px solid #6b5b9e; padding:18px 24px; border-radius:0 6px 6px 0;"><p style="margin:0 0 4px 0; font-family:'Courier New',monospace; font-size:10px; color:#4d3f80; letter-spacing:0.15em; text-transform:uppercase; font-weight:700;">● Question 03</p><p class="question-text" style="margin:0; font-family:Georgia,'Times New Roman',serif; font-size:18px; line-height:1.4; color:#1a1a1d; font-weight:400;">What price <em style="color:#4d3f80; font-style:italic;">feels right</em> to you for a device like this?</p></td></tr></table>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:32px;"><tr><td style="background-color:#fbf5f2; border-left:3px solid #c87858; padding:18px 24px; border-radius:0 6px 6px 0;"><p style="margin:0 0 4px 0; font-family:'Courier New',monospace; font-size:10px; color:#9c5a40; letter-spacing:0.15em; text-transform:uppercase; font-weight:700;">● Question 04</p><p class="question-text" style="margin:0; font-family:Georgia,'Times New Roman',serif; font-size:18px; line-height:1.4; color:#1a1a1d; font-weight:400;">Anything else <em style="color:#9c5a40; font-style:italic;">we should know?</em></p></td></tr></table>
            <p style="margin:0; font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif; font-size:14px; line-height:1.6; color:#8a8a92; font-style:italic;">Just hit reply. We read every single response — personally.</p>
          </td></tr>
        </table>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td class="px-48" style="padding:40px 48px 0 48px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td height="1" style="background-color:#e5e3de; line-height:1px; font-size:1px;">&nbsp;</td></tr></table></td></tr></table>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td class="px-48" style="padding:40px 48px 0 48px;">
            <p style="margin:0 0 8px 0; font-family:'Courier New',monospace; font-size:11px; color:#c9a96e; letter-spacing:0.18em; text-transform:uppercase;">— 03 What you're reserving</p>
            <p class="body-h2" style="margin:0 0 24px 0; font-family:Georgia,'Times New Roman',serif; font-size:24px; line-height:1.3; color:#1a1a1d; font-weight:400; letter-spacing:-0.01em;">Crafted to the <em style="color:#c9a96e; font-style:italic;">millimeter.</em></p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr><td width="32" valign="top" style="padding:8px 0;"><span style="display:inline-block; width:8px; height:8px; background-color:#c9a96e; border-radius:50%; margin-top:8px;"></span></td><td style="font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif; font-size:15px; line-height:1.7; color:#3a3a3d; padding:8px 0;"><strong style="color:#1a1a1d;">AMOLED display</strong> — same tech as flagship phones</td></tr>
              <tr><td width="32" valign="top" style="padding:8px 0;"><span style="display:inline-block; width:8px; height:8px; background-color:#c9a96e; border-radius:50%; margin-top:8px;"></span></td><td style="font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif; font-size:15px; line-height:1.7; color:#3a3a3d; padding:8px 0;"><strong style="color:#1a1a1d;">CNC-milled aluminum</strong> — matte black anodized, premium finish</td></tr>
              <tr><td width="32" valign="top" style="padding:8px 0;"><span style="display:inline-block; width:8px; height:8px; background-color:#c9a96e; border-radius:50%; margin-top:8px;"></span></td><td style="font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif; font-size:15px; line-height:1.7; color:#3a3a3d; padding:8px 0;"><strong style="color:#1a1a1d;">Matching aluminum base</strong> — calibrated viewing angle, included</td></tr>
              <tr><td width="32" valign="top" style="padding:8px 0;"><span style="display:inline-block; width:8px; height:8px; background-color:#c9a96e; border-radius:50%; margin-top:8px;"></span></td><td style="font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif; font-size:15px; line-height:1.7; color:#3a3a3d; padding:8px 0;"><strong style="color:#1a1a1d;">10,000+ instruments</strong> — crypto, forex, stocks, gold, oil, indices</td></tr>
              <tr><td width="32" valign="top" style="padding:8px 0;"><span style="display:inline-block; width:8px; height:8px; background-color:#34d399; border-radius:50%; margin-top:8px;"></span></td><td style="font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif; font-size:15px; line-height:1.7; color:#3a3a3d; padding:8px 0;"><strong style="color:#1a1a1d;">Live data, always.</strong> No app. No subscription. WiFi setup in 60 seconds.</td></tr>
            </table>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="left" style="margin:24px 0 0 0;"><tr><td style="background-color:#0a0a0c; border-radius:30px; padding:0;"><a href="https://tickrix.com" style="display:inline-block; padding:14px 28px; font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif; font-size:13px; font-weight:600; color:#c9a96e; text-decoration:none; letter-spacing:0.02em;">Visit tickrix.com →</a></td></tr></table>
          </td></tr>
        </table>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td class="px-48" style="padding:40px 48px 0 48px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td height="1" style="background-color:#e5e3de; line-height:1px; font-size:1px;">&nbsp;</td></tr></table></td></tr></table>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td class="px-48 py-48" style="padding:40px 48px 48px 48px;">
            <p style="margin:0 0 8px 0; font-family:'Courier New',monospace; font-size:11px; color:#c9a96e; letter-spacing:0.18em; text-transform:uppercase;">— A note from us</p>
            <p style="margin:0 0 20px 0; font-family:Georgia,'Times New Roman',serif; font-size:18px; line-height:1.6; color:#1a1a1d; font-style:italic; font-weight:400;">"We didn't build Tickrix to disrupt anything. We built it because the thing we wanted didn't exist."</p>
            <p style="margin:0 0 16px 0; font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif; font-size:15px; line-height:1.7; color:#3a3a3d;">No team of designers. No focus groups. No round of funding. Just one trader, one frustration, and a long list of late nights.</p>
            <p style="margin:0; font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif; font-size:15px; line-height:1.7; color:#3a3a3d;">Thank you for being part of this. <em style="color:#1a1a1d;">It matters more than you know.</em></p>
            <p style="margin:24px 0 0 0; font-family:'Courier New',monospace; font-size:11px; color:#8a8a92; letter-spacing:0.15em; text-transform:uppercase;">— Tickrix · Rotterdam</p>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="background-color:#0a0a0c; border-radius:0 0 8px 8px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td class="px-48" align="center" style="padding:40px 48px;">
            <p style="margin:0 0 16px 0; font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif; font-size:14px; font-weight:700; color:#ffffff; letter-spacing:0.02em;">Tickrix<sup style="font-size:9px; color:#8a8a92; font-weight:400;">®</sup></p>
            <p style="margin:0 0 24px 0; font-family:Georgia,'Times New Roman',serif; font-style:italic; font-size:14px; color:#8a8a92;">For traders who take it seriously.</p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 24px auto;"><tr>
              <td style="padding:0 12px;"><a href="https://tickrix.com" style="color:#c9a96e; text-decoration:none; font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif; font-size:12px; letter-spacing:0.05em;">tickrix.com</a></td>
              <td style="padding:0 12px; color:#8c754c;">·</td>
              <td style="padding:0 12px;"><a href="mailto:hello@tickrix.com" style="color:#c9a96e; text-decoration:none; font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif; font-size:12px; letter-spacing:0.05em;">hello@tickrix.com</a></td>
              <td style="padding:0 12px; color:#8c754c;">·</td>
              <td style="padding:0 12px;"><a href="https://x.com/tickrix" style="color:#c9a96e; text-decoration:none; font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif; font-size:12px; letter-spacing:0.05em;">@tickrix</a></td>
            </tr></table>
            <p style="margin:0 0 8px 0; font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif; font-size:11px; color:#525258; line-height:1.6;">You're receiving this because you joined the Tickrix waitlist at tickrix.com.</p>
            <p style="margin:0; font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif; font-size:11px; color:#525258; line-height:1.6;">
              <a href="https://tickrix.com/unsubscribe?email=${encodedEmail}" style="color:#8a8a92; text-decoration:underline;">Unsubscribe</a> · 
              <a href="https://tickrix.com/privacy" style="color:#8a8a92; text-decoration:underline;">Privacy</a> · 
              © 2026 Tickrix · Rotterdam, Netherlands
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

