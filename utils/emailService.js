// utils/emailService.js
import nodemailer from 'nodemailer';

let transporter = null;
let initialized = false;

// ✅ Lazy initialization - reads env AFTER dotenv.config() runs
const getTransporter = () => {
  if (initialized) return transporter;
  initialized = true;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secure = process.env.SMTP_SECURE === 'true';

  console.log('📧 Initializing email service:', {
    host: host || '❌ MISSING',
    port,
    user: user || '❌ MISSING',
    passLength: pass ? `✅ ${pass.length} chars` : '❌ MISSING'
  });

  if (!host || !user || !pass) {
    const missing = [];
    if (!host) missing.push('SMTP_HOST');
    if (!user) missing.push('SMTP_USER');
    if (!pass) missing.push('SMTP_PASS');
    console.log(`⚠️ Email not configured - Missing: ${missing.join(', ')}`);
    return null;
  }

  try {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      // ✅ Short timeouts so email failure doesn't block anything
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
      tls: { rejectUnauthorized: false }
    });

    console.log('✅ Email service ready');
    return transporter;
  } catch (error) {
    console.error('❌ Email setup failed:', error.message);
    return null;
  }
};

// ✅ Verify connection (optional - call on startup)
export const verifyEmailConnection = async () => {
  const t = getTransporter();
  if (!t) return false;

  try {
    await t.verify();
    console.log('✅ Email connection verified successfully');
    return true;
  } catch (error) {
    console.error('❌ Email verify failed:', error.message);

    if (
      error.message.includes('Invalid login') ||
      error.message.includes('535') ||
      error.message.includes('Username and Password')
    ) {
      console.error('');
      console.error('💡 Gmail App Password Fix:');
      console.error('   1. https://myaccount.google.com → Security');
      console.error('   2. Enable 2-Step Verification');
      console.error('   3. Search "App passwords" → Create');
      console.error('   4. Copy 16 chars WITHOUT spaces → SMTP_PASS in .env');
      console.error('');
    }

    if (error.message.includes('ETIMEDOUT')) {
      console.error('');
      console.error('💡 Port blocked by ISP. Try:');
      console.error('   SMTP_PORT=465 + SMTP_SECURE=true');
      console.error('   or SMTP_PORT=2525 + SMTP_SECURE=false');
      console.error('');
    }

    return false;
  }
};

// =============================================
// BASE SENDER
// ✅ Returns result but NEVER throws
// =============================================
const sendEmail = async (options) => {
  const t = getTransporter();

  if (!t) {
    console.log('⚠️ Email skipped - service not configured');
    return { success: false, message: 'Email service not configured' };
  }

  try {
    const fromName = process.env.FROM_NAME || 'LearnHub';
    const fromEmail = process.env.FROM_EMAIL || process.env.SMTP_USER;

    console.log(`📤 Sending: "${options.subject}" → ${options.to}`);

    const info = await t.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.html?.replace(/<[^>]*>/g, '') || ''
    });

    console.log(`✅ Email sent! ID: ${info.messageId}`);
    return { success: true, messageId: info.messageId };

  } catch (error) {
    console.error('❌ Email send error:', error.message);

    if (error.responseCode === 535 || error.message.includes('Invalid login')) {
      console.error('💡 Fix: Check Gmail App Password in .env (no spaces, 16 chars)');
    }

    if (error.message.includes('ETIMEDOUT')) {
      console.error('💡 Fix: ISP blocking port. Try SMTP_PORT=465 + SMTP_SECURE=true');
    }

    // ✅ Never throw - just return failure
    return { success: false, error: error.message };
  }
};

// =============================================
// BASE TEMPLATE
// =============================================
const baseTemplate = (content) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LearnHub</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0"
         style="background-color:#f3f4f6;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:16px;overflow:hidden;
                      box-shadow:0 4px 6px rgba(0,0,0,0.07);
                      max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#3B82F6,#8B5CF6);
                       padding:32px;text-align:center;">
              <h1 style="color:#ffffff;margin:0;font-size:28px;font-weight:800;">
                📚 LearnHub
              </h1>
              <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px;">
                Empowering Learning, One Course at a Time
              </p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding:40px 32px;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:24px 32px;
                       border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">
                © ${new Date().getFullYear()} LearnHub. All rights reserved.
              </p>
              <p style="margin:8px 0 0;color:#9ca3af;font-size:12px;">
                If you didn't request this, please ignore this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

// ✅ Reusable button
const emailButton = (text, url, color = '#3B82F6') => `
  <div style="text-align:center;margin:24px 0;">
    <a href="${url}"
       style="display:inline-block;padding:14px 32px;
              background-color:${color};color:#ffffff;
              text-decoration:none;border-radius:8px;
              font-weight:700;font-size:15px;">
      ${text}
    </a>
  </div>
  <p style="color:#9ca3af;font-size:12px;text-align:center;word-break:break-all;">
    Or copy this link:
    <a href="${url}" style="color:#3b82f6;">${url}</a>
  </p>
`;

// =============================================
// EMAIL FUNCTIONS
// =============================================

// ✅ Welcome Email
export const sendWelcomeEmail = async (user) => {
  const content = `
    <h2 style="color:#1f2937;margin:0 0 16px;font-size:24px;font-weight:700;">
      Welcome to LearnHub, ${user.firstName}! 🎉
    </h2>
    <p style="color:#4b5563;line-height:1.6;margin:0 0 16px;">
      We're thrilled to have you join our learning community!
      Start exploring hundreds of expert-led courses today.
    </p>
    <div style="background:#f0f9ff;border-left:4px solid #3B82F6;
                border-radius:8px;padding:16px;margin:20px 0;">
      <p style="color:#1e40af;margin:0;font-size:14px;font-weight:600;">
        🚀 What you can do next:
      </p>
      <ul style="color:#3b82f6;margin:8px 0 0;padding-left:20px;font-size:14px;">
        <li>Browse our course catalog</li>
        <li>Enroll in your first course</li>
        <li>Earn certificates</li>
      </ul>
    </div>
    ${emailButton('Browse Courses', `${process.env.FRONTEND_URL}/courses`)}
    <p style="color:#6b7280;font-size:14px;margin-top:16px;">
      Happy learning!<br/>
      <strong>The LearnHub Team</strong>
    </p>
  `;

  return sendEmail({
    to: user.email,
    subject: '🎓 Welcome to LearnHub - Start Learning Today!',
    html: baseTemplate(content)
  });
};

// ✅ Email Verification
export const sendEmailVerificationEmail = async (user, token) => {
  const url = `${process.env.FRONTEND_URL}/verify-email/${token}`;

  const content = `
    <h2 style="color:#1f2937;margin:0 0 16px;font-size:24px;font-weight:700;">
      Verify Your Email Address ✉️
    </h2>
    <p style="color:#4b5563;line-height:1.6;margin:0 0 16px;">
      Hi <strong>${user.firstName}</strong>, thanks for signing up!
      Please verify your email address to activate your account.
    </p>
    <div style="background:#fefce8;border-left:4px solid #f59e0b;
                border-radius:8px;padding:16px;margin:16px 0;">
      <p style="color:#92400e;margin:0;font-size:14px;">
        ⏰ This link expires in <strong>24 hours</strong>.
        Check your spam folder if you don't see it in your inbox.
      </p>
    </div>
    ${emailButton('✅ Verify My Email', url, '#10B981')}
  `;

  return sendEmail({
    to: user.email,
    subject: '✅ Verify Your Email - LearnHub',
    html: baseTemplate(content)
  });
};

// ✅ Password Reset
export const sendPasswordResetEmail = async (user, resetToken) => {
  const url = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

  const content = `
    <h2 style="color:#1f2937;margin:0 0 16px;font-size:24px;font-weight:700;">
      Reset Your Password 🔐
    </h2>
    <p style="color:#4b5563;line-height:1.6;margin:0 0 16px;">
      Hi <strong>${user.firstName}</strong>, we received a request to reset 
      your LearnHub password.
    </p>
    <div style="background:#fff7ed;border-left:4px solid #f97316;
                border-radius:8px;padding:16px;margin:16px 0;">
      <p style="color:#9a3412;margin:0;font-size:14px;">
        ⏰ This link expires in <strong>1 hour</strong>.
        If you didn't request this, you can safely ignore this email.
      </p>
    </div>
    ${emailButton('🔐 Reset My Password', url, '#EF4444')}
    <div style="background:#fef2f2;border-radius:8px;
                padding:12px 16px;margin:16px 0;">
      <p style="color:#991b1b;margin:0;font-size:13px;">
        🛡️ <strong>Security tip:</strong> LearnHub will never ask for 
        your password via email or phone.
      </p>
    </div>
  `;

  return sendEmail({
    to: user.email,
    subject: '🔐 Password Reset Request - LearnHub',
    html: baseTemplate(content)
  });
};

// ✅ Payment Status
export const sendPaymentStatusEmail = async (user, payment, status) => {
  const isApproved = status === 'approved';
  const statusColor = isApproved ? '#10B981' : '#EF4444';
  const statusIcon = isApproved ? '✅' : '❌';

  const content = `
    <h2 style="color:#1f2937;margin:0 0 16px;font-size:24px;font-weight:700;">
      Payment ${isApproved ? 'Approved' : 'Rejected'} ${statusIcon}
    </h2>
    <p style="color:#4b5563;line-height:1.6;">
      Hi <strong>${user.firstName}</strong>, 
      your payment status has been updated.
    </p>
    <div style="background:#f9fafb;border-radius:8px;
                padding:20px;margin:20px 0;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:6px 0;color:#6b7280;font-size:14px;">
            Payment ID
          </td>
          <td style="padding:6px 0;text-align:right;font-weight:600;
                     font-size:14px;color:#1f2937;">
            ${payment.paymentId}
          </td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#6b7280;font-size:14px;">
            Amount
          </td>
          <td style="padding:6px 0;text-align:right;font-weight:600;
                     font-size:14px;color:#1f2937;">
            Rs. ${payment.amount}
          </td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#6b7280;font-size:14px;">
            Status
          </td>
          <td style="padding:6px 0;text-align:right;font-weight:700;
                     font-size:14px;color:${statusColor};">
            ${isApproved ? 'Approved' : 'Rejected'}
          </td>
        </tr>
      </table>
    </div>
    ${isApproved
      ? `<p style="color:#059669;font-weight:600;">
           🎉 You can now access your enrolled course!
         </p>
         ${emailButton('Start Learning Now',
           `${process.env.FRONTEND_URL}/my-courses`, '#10B981')}`
      : `<div style="background:#fef2f2;border-radius:8px;padding:16px;margin:16px 0;">
           <p style="color:#dc2626;margin:0;font-size:14px;">
             <strong>Reason:</strong> 
             ${payment.rejectionReason || 'Please contact support for details.'}
           </p>
         </div>`
    }
  `;

  return sendEmail({
    to: user.email,
    subject: `Payment ${isApproved ? 'Approved ✅' : 'Rejected ❌'} - LearnHub`,
    html: baseTemplate(content)
  });
};

// ✅ Enrollment Confirmation
export const sendEnrollmentConfirmation = async (user, course) => {
  const courseUrl = `${process.env.FRONTEND_URL}/learn/${course.slug}`;

  const content = `
    <h2 style="color:#1f2937;margin:0 0 16px;font-size:24px;font-weight:700;">
      Enrollment Confirmed! 🎉
    </h2>
    <p style="color:#4b5563;line-height:1.6;">
      Hi <strong>${user.firstName}</strong>, 
      congratulations! You're now enrolled in:
    </p>
    <div style="background:#f0f9ff;border-radius:8px;
                padding:20px;margin:20px 0;text-align:center;">
      <h3 style="color:#1e40af;margin:0;font-size:18px;">
        ${course.title}
      </h3>
    </div>
    <p style="color:#4b5563;font-size:14px;">
      You have <strong>lifetime access</strong> to this course. 
      Learn at your own pace!
    </p>
    ${emailButton('🚀 Start Learning Now', courseUrl)}
  `;

  return sendEmail({
    to: user.email,
    subject: `🎓 Enrolled: "${course.title}" - LearnHub`,
    html: baseTemplate(content)
  });
};

export default sendEmail;