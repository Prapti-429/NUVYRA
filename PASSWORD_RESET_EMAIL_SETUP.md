# NUVYRA password-reset email setup

The password-reset endpoint needs a real email provider. The recommended setup is Resend because its HTTPS API avoids SMTP port restrictions on hosted platforms.

1. Create a Resend account and verify a domain you control. Resend will not reliably deliver production mail from an unverified sender.
2. Create an API key in Resend.
3. In Render, open the **digital-biomarker-backend** service, then **Environment**.
4. Add:
   - `RESEND_API_KEY`: the Resend API key (keep it private)
   - `SMTP_FROM_EMAIL`: a sender using the verified domain, e.g. `NUVYRA <no-reply@your-verified-domain>`
   - `FRONTEND_URL`: the actual public URL of the NUVYRA frontend
5. Save changes and redeploy the backend.

The backend uses Resend when `RESEND_API_KEY` is present. If it is absent, it falls back to SMTP when `SMTP_HOST` and `SMTP_FROM_EMAIL` are configured. Do not commit API keys or SMTP passwords to GitHub.

A successful API response to the forgot-password request is intentionally generic to avoid revealing whether an email address has an account. Check the backend Render logs for delivery errors if a message does not arrive.
