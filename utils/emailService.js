// utils/emailService.js
import nodemailer from 'nodemailer';

let transporter = null;
let isEmailConfigured = false;

// Initialize transporter
const initializeTransporter = () => {
  try {
    // Check if email configuration exists
    if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.log('⚠️  Email configuration missing - emails will be logged to console');
      return null;
    }

    // Create transporter
    const transport = nodemailer.createTransporter({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: process.env.EMAIL_PORT === '465',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      tls: {
        rejectUnauthorized: false // Accept self-signed certificates
      }
    });

    // Don't verify immediately, just return the transport
    return transport;
  } catch (error) {
    console.error('❌ Email transporter creation error:', error.message);
    return null;
  }
};

// Initialize on module load
transporter = initializeTransporter();

// Verify connection after a delay (don't block server startup)
if (transporter) {
  setTimeout(() => {
    transporter.verify((error, success) => {
      if (error) {
        console.error('⚠️  Email service not available:', error.message);
        console.log('📧 Emails will be logged to console instead');
        isEmailConfigured = false;
      } else {
        console.log('✅ Email server is ready');
        isEmailConfigured = true;
      }
    });
  }, 2000); // Check after 2 seconds
}

// Base email sending function with fallback
export const sendEmail = async ({ to, subject, html, text }) => {
  try {
    // If transporter is not configured, log to console instead
    if (!transporter || !isEmailConfigured) {
      console.log('📧 Email (Console Mode):');
      console.log('   To:', to);
      console.log('   Subject:', subject);
      if (text) {
        console.log('   Content:', text.substring(0, 100) + '...');
      }
      return { 
        messageId: 'console-' + Date.now(),
        accepted: [to],
        response: 'Email logged to console (email service not configured)'
      };
    }

    const mailOptions = {
      from: `"LearnHub" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
      text: text || 'This is an HTML email. Please enable HTML to view it properly.'
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email sent:', info.messageId);
    return info;
  } catch (error) {
    // Don't throw - log and return error info
    console.error('⚠️  Email send failed:', error.message);
    console.log('📧 Email details (failed to send):');
    console.log('   To:', to);
    console.log('   Subject:', subject);
    
    // Return a mock response so the app continues working
    return {
      messageId: 'error-' + Date.now(),
      error: error.message,
      accepted: [],
      rejected: [to]
    };
  }
};

// ============ Email Templates ============

// Welcome Email
export const sendWelcomeEmail = async (user) => {
  const html = `<!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f4f7fa;">
        <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 16px 16px 0 0; padding: 40px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 28px;">🎉 Welcome to LearnHub!</h1>
            </div>
            <div style="background: white; padding: 40px; border-radius: 0 0 16px 16px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                <p style="font-size: 18px; color: #333; margin-bottom: 20px;">Hi ${user.firstName},</p>
                <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
                    Thank you for joining LearnHub! We're thrilled to have you on board. 
                    You're now part of a community of learners dedicated to growing their skills.
                </p>
                <p style="color: #666; line-height: 1.6; margin-bottom: 30px;">
                    Start exploring our courses and begin your learning journey today!
                </p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${process.env.FRONTEND_URL}/courses" 
                       style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                              color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; 
                              font-weight: 600; font-size: 16px;">
                        Browse Courses
                    </a>
                </div>
                <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                <p style="color: #999; font-size: 14px; text-align: center;">
                    Best regards,<br>The LearnHub Team
                </p>
            </div>
        </div>
    </body>
    </html>`;

  return await sendEmail({
    to: user.email,
    subject: '🎉 Welcome to LearnHub!',
    html,
    text: `Welcome to LearnHub, ${user.firstName}! Start exploring our courses today.`
  });
};

// Email Verification
export const sendVerificationEmail = async (user, token) => {
  const verifyUrl = `${process.env.FRONTEND_URL}/verify-email/${token}`;

  const html = `<!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f4f7fa;">
        <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 16px 16px 0 0; padding: 40px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 28px;">📧 Verify Your Email</h1>
            </div>
            <div style="background: white; padding: 40px; border-radius: 0 0 16px 16px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                <p style="font-size: 18px; color: #333; margin-bottom: 20px;">Hi ${user.firstName},</p>
                <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
                    Thanks for registering with LearnHub! Please verify your email address by clicking the button below.
                </p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${verifyUrl}" 
                       style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); 
                              color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; 
                              font-weight: 600; font-size: 16px;">
                        Verify Email Address
                    </a>
                </div>
                <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
                    Or copy and paste this link into your browser:
                </p>
                <div style="background: #f4f7fa; padding: 12px; border-radius: 8px; word-break: break-all; margin-bottom: 20px;">
                    <a href="${verifyUrl}" style="color: #667eea; font-size: 14px;">${verifyUrl}</a>
                </div>
                <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
                    <p style="color: #92400e; margin: 0; font-size: 14px;">
                        ⏰ This link will expire in 24 hours.
                    </p>
                </div>
                <p style="color: #999; font-size: 14px;">
                    If you didn't create an account with LearnHub, please ignore this email.
                </p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                <p style="color: #999; font-size: 14px; text-align: center;">
                    Best regards,<br>The LearnHub Team
                </p>
            </div>
        </div>
    </body>
    </html>`;

  return await sendEmail({
    to: user.email,
    subject: '📧 Verify Your Email - LearnHub',
    html,
    text: `Hi ${user.firstName}, please verify your email by visiting: ${verifyUrl}`
  });
};

// Password Reset Email
export const sendPasswordResetEmail = async (user, token) => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${token}`;

  const html = `<!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f4f7fa;">
        <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); border-radius: 16px 16px 0 0; padding: 40px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 28px;">🔐 Reset Your Password</h1>
            </div>
            <div style="background: white; padding: 40px; border-radius: 0 0 16px 16px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                <p style="font-size: 18px; color: #333; margin-bottom: 20px;">Hi ${user.firstName},</p>
                <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
                    We received a request to reset your password. Click the button below to create a new password.
                </p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${resetUrl}" 
                       style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                              color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; 
                              font-weight: 600; font-size: 16px;">
                        Reset Password
                    </a>
                </div>
                <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
                    Or copy and paste this link into your browser:
                </p>
                <div style="background: #f4f7fa; padding: 12px; border-radius: 8px; word-break: break-all; margin-bottom: 20px;">
                    <a href="${resetUrl}" style="color: #667eea; font-size: 14px;">${resetUrl}</a>
                </div>
                <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
                    <p style="color: #92400e; margin: 0; font-size: 14px;">
                        ⏰ This link will expire in 1 hour.
                    </p>
                </div>
                <div style="background: #fee2e2; border: 1px solid #ef4444; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
                    <p style="color: #991b1b; margin: 0; font-size: 14px;">
                        🔒 If you didn't request a password reset, please ignore this email or contact support if you're concerned about your account security.
                    </p>
                </div>
                <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                <p style="color: #999; font-size: 14px; text-align: center;">
                    Best regards,<br>The LearnHub Team
                </p>
            </div>
        </div>
    </body>
    </html>`;

  return await sendEmail({
    to: user.email,
    subject: '🔐 Reset Your Password - LearnHub',
    html,
    text: `Hi ${user.firstName}, reset your password by visiting: ${resetUrl}`
  });
};

// Enrollment Confirmation Email
export const sendEnrollmentConfirmation = async (user, course) => {
  const html = `<!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f4f7fa;">
        <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 16px 16px 0 0; padding: 40px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 28px;">🎓 Enrollment Confirmed!</h1>
            </div>
            <div style="background: white; padding: 40px; border-radius: 0 0 16px 16px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                <p style="font-size: 18px; color: #333; margin-bottom: 20px;">Hi ${user.firstName},</p>
                <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
                    Congratulations! You've successfully enrolled in:
                </p>
                <div style="background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%); border-radius: 12px; padding: 20px; margin-bottom: 20px;">
                    <h2 style="color: #333; margin: 0 0 10px 0; font-size: 20px;">${course.title}</h2>
                </div>
                <p style="color: #666; line-height: 1.6; margin-bottom: 30px;">
                    Start learning now and achieve your goals!
                </p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${process.env.FRONTEND_URL}/learn/${course.slug}" 
                       style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                              color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; 
                              font-weight: 600; font-size: 16px;">
                        Start Learning
                    </a>
                </div>
                <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                <p style="color: #999; font-size: 14px; text-align: center;">
                    Best regards,<br>The LearnHub Team
                </p>
            </div>
        </div>
    </body>
    </html>`;

  return await sendEmail({
    to: user.email,
    subject: `🎓 Enrollment Confirmed - ${course.title}`,
    html,
    text: `Hi ${user.firstName}, you've successfully enrolled in ${course.title}. Start learning now!`
  });
};

// Payment Status Email
export const sendPaymentStatusEmail = async (user, payment, status) => {
  const statusConfig = {
    approved: {
      gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
      icon: '✅',
      title: 'Payment Approved!',
      message: 'Your payment has been verified and approved. You can now access your course.'
    },
    rejected: {
      gradient: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
      icon: '❌',
      title: 'Payment Not Approved',
      message: `Your payment could not be verified. ${payment.rejectionReason ? `Reason: ${payment.rejectionReason}` : 'Please contact support for more information.'}`
    }
  };

  const config = statusConfig[status];
  if (!config) return;

  const html = `<!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f4f7fa;">
        <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <div style="background: ${config.gradient}; border-radius: 16px 16px 0 0; padding: 40px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 28px;">${config.icon} ${config.title}</h1>
            </div>
            <div style="background: white; padding: 40px; border-radius: 0 0 16px 16px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                <p style="font-size: 18px; color: #333; margin-bottom: 20px;">Hi ${user.firstName},</p>
                <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">${config.message}</p>
                <div style="background: #f4f7fa; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
                    <p style="color: #333; margin: 0; font-size: 14px;">
                        <strong>Payment ID:</strong> ${payment.paymentId}
                    </p>
                </div>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${process.env.FRONTEND_URL}/dashboard" 
                       style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                              color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; 
                              font-weight: 600; font-size: 16px;">
                        Go to Dashboard
                    </a>
                </div>
                <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                <p style="color: #999; font-size: 14px; text-align: center;">
                    Best regards,<br>The LearnHub Team
                </p>
            </div>
        </div>
    </body>
    </html>`;

  return await sendEmail({
    to: user.email,
    subject: `${config.icon} Payment ${status === 'approved' ? 'Approved' : 'Update'} - LearnHub`,
    html,
    text: `Hi ${user.firstName}, ${config.message} Payment ID: ${payment.paymentId}`
  });
};