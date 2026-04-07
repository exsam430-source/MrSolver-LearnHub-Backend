// utils/emailService.js
import nodemailer from 'nodemailer';

let transporter = null;

// Create transporter only if email config exists
const createTransporter = () => {
  try {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.log('⚠️ Email service not configured - missing SMTP credentials');
      return null;
    }

    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    console.log('✅ Email transporter created successfully');
    return transporter;
  } catch (error) {
    console.error('❌ Email transporter creation error:', error.message);
    return null;
  }
};

// Initialize transporter
createTransporter();

// Helper function to send email
const sendEmail = async (options) => {
  if (!transporter) {
    console.log('⚠️ Email not sent - transporter not configured');
    return { success: false, message: 'Email service not configured' };
  }

  try {
    const mailOptions = {
      from: `"${process.env.FROM_NAME || 'LearnHub'}" <${process.env.FROM_EMAIL || process.env.SMTP_USER}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Email sending error:', error.message);
    return { success: false, error: error.message };
  }
};

// Email Templates
export const sendVerificationEmail = async (user, verificationToken) => {
  const verificationUrl = `${process.env.FRONTEND_URL}/verify-email/${verificationToken}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Welcome to LearnHub!</h2>
      <p>Hi ${user.firstName},</p>
      <p>Thank you for registering. Please verify your email address by clicking the button below:</p>
      <a href="${verificationUrl}" style="display: inline-block; padding: 12px 24px; background-color: #3B82F6; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0;">
        Verify Email
      </a>
      <p>Or copy and paste this link in your browser:</p>
      <p>${verificationUrl}</p>
      <p>This link expires in 24 hours.</p>
      <p>Best regards,<br>LearnHub Team</p>
    </div>
  `;

  return sendEmail({
    to: user.email,
    subject: 'Verify Your Email - LearnHub',
    html,
  });
};

export const sendPasswordResetEmail = async (user, resetToken) => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Password Reset Request</h2>
      <p>Hi ${user.firstName},</p>
      <p>You requested to reset your password. Click the button below to set a new password:</p>
      <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #3B82F6; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0;">
        Reset Password
      </a>
      <p>Or copy and paste this link in your browser:</p>
      <p>${resetUrl}</p>
      <p>This link expires in 1 hour.</p>
      <p>If you didn't request this, please ignore this email.</p>
      <p>Best regards,<br>LearnHub Team</p>
    </div>
  `;

  return sendEmail({
    to: user.email,
    subject: 'Password Reset - LearnHub',
    html,
  });
};

export const sendPaymentStatusEmail = async (user, payment, status) => {
  const statusText = status === 'approved' ? 'Approved ✅' : 'Rejected ❌';
  const statusColor = status === 'approved' ? '#10B981' : '#EF4444';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Payment Status Update</h2>
      <p>Hi ${user.firstName},</p>
      <p>Your payment for course enrollment has been <strong style="color: ${statusColor};">${statusText}</strong>.</p>
      <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p><strong>Payment ID:</strong> ${payment.paymentId}</p>
        <p><strong>Amount:</strong> Rs. ${payment.amount}</p>
        <p><strong>Status:</strong> ${statusText}</p>
      </div>
      ${status === 'approved' 
        ? '<p>You can now access your course. Happy learning!</p>' 
        : `<p>Reason: ${payment.rejectionReason || 'Please contact support for more information.'}</p>`
      }
      <p>Best regards,<br>LearnHub Team</p>
    </div>
  `;

  return sendEmail({
    to: user.email,
    subject: `Payment ${status === 'approved' ? 'Approved' : 'Rejected'} - LearnHub`,
    html,
  });
};

export const sendEnrollmentConfirmation = async (user, course) => {
  const courseUrl = `${process.env.FRONTEND_URL}/learn/${course.slug}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Enrollment Confirmed! 🎉</h2>
      <p>Hi ${user.firstName},</p>
      <p>Congratulations! You've been successfully enrolled in:</p>
      <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin: 0 0 10px 0;">${course.title}</h3>
      </div>
      <a href="${courseUrl}" style="display: inline-block; padding: 12px 24px; background-color: #3B82F6; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0;">
        Start Learning
      </a>
      <p>Best regards,<br>LearnHub Team</p>
    </div>
  `;

  return sendEmail({
    to: user.email,
    subject: `Enrollment Confirmed - ${course.title}`,
    html,
  });
};

export const sendWelcomeEmail = async (user) => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Welcome to LearnHub! 🎓</h2>
      <p>Hi ${user.firstName},</p>
      <p>Thank you for joining LearnHub. We're excited to have you on board!</p>
      <p>Start exploring our courses and begin your learning journey today.</p>
      <a href="${process.env.FRONTEND_URL}/courses" style="display: inline-block; padding: 12px 24px; background-color: #3B82F6; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0;">
        Browse Courses
      </a>
      <p>Best regards,<br>LearnHub Team</p>
    </div>
  `;

  return sendEmail({
    to: user.email,
    subject: 'Welcome to LearnHub!',
    html,
  });
};

export default sendEmail;