const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
    if (!process.env.SMTP_HOST) {
        return null;
    }
    if (!transporter) {
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT) || 587,
            secure: Number(process.env.SMTP_PORT) === 465,
            auth: process.env.SMTP_USER ? {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            } : undefined
        });
    }
    return transporter;
}

// Sends an email if SMTP_* env vars are configured, otherwise logs to console
// so the app keeps working without a mail provider set up yet.
//
// SECURITY: the console fallback must never print sensitive content (password
// reset links/tokens, etc.) in production - only in development, where it's
// the only way to test the flow without a real mail provider.
exports.sendMail = async ({ to, subject, text, html }) => {
    const mail = getTransporter();
    if (!mail) {
        if (process.env.NODE_ENV === 'production') {
            console.warn(`[mailer] SMTP not configured - email to ${to} ("${subject}") was NOT sent. Configure SMTP_* env vars.`);
        } else {
            console.log(`[mailer] SMTP not configured - would have sent email to ${to}: ${subject}\n${text}`);
        }
        return;
    }
    await mail.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to,
        subject,
        text,
        html
    });
};
