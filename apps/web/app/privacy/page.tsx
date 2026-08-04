import type { Metadata } from 'next';
import { LegalLayout } from '@/components/legal/LegalLayout';

export const metadata: Metadata = {
  title: 'Privacy Policy — Coursel',
};

export default function PrivacyPolicyPage() {
  return (
    <LegalLayout title="Privacy Policy" lastUpdated="June 30, 2026">
      <p>
        Coursel ("we", "us", "our") operates coursel.space and all subdomains created by
        schools and instructors ("Tenants") using our platform. This Privacy Policy explains
        what information we collect, how we use it, and the choices you have.
      </p>

      <section>
        <h2>1. Information We Collect</h2>
        <ul>
          <li><strong>Account information:</strong> name, email address, and password (hashed) when you or a Tenant registers.</li>
          <li><strong>Tenant data:</strong> school name, branding, course content, and student records, owned and controlled by each Tenant.</li>
          <li><strong>Billing information:</strong> processed by our payment partners (Lemon Squeezy for subscriptions, Stripe for course purchases). We do not store full card numbers.</li>
          <li><strong>Usage data:</strong> log data, device/browser information, and analytics collected to operate and improve the platform.</li>
          <li><strong>Cookies:</strong> used for authentication sessions and to remember tenant context (subdomain).</li>
        </ul>
      </section>

      <section>
        <h2>2. How We Use Information</h2>
        <ul>
          <li>To provide, operate, and maintain the Coursel platform.</li>
          <li>To process payments and manage subscriptions.</li>
          <li>To send transactional emails (account verification, password resets, billing receipts).</li>
          <li>To respond to support requests.</li>
          <li>To detect, prevent, and address fraud, abuse, or security issues.</li>
        </ul>
      </section>

      <section>
        <h2>3. Data Isolation Between Schools</h2>
        <p>
          Coursel is a multi-tenant platform. Each school (Tenant) operates on its own subdomain
          with isolated data. Tenant Admins control their own students' and instructors' data and
          are independently responsible for complying with applicable privacy laws for their users.
        </p>
      </section>

      <section>
        <h2>4. Third-Party Services</h2>
        <p>We share data with the following service providers only as needed to operate the platform:</p>
        <ul>
          <li><strong>Lemon Squeezy</strong> — subscription billing and payment processing.</li>
          <li><strong>Stripe</strong> — course payment processing (per-tenant, where enabled).</li>
          <li><strong>Cloudflare</strong> — content delivery, file storage, and video streaming.</li>
          <li><strong>Brevo</strong> — transactional email delivery.</li>
          <li><strong>MongoDB Atlas</strong> — database hosting.</li>
        </ul>
      </section>

      <section>
        <h2>5. Data Retention</h2>
        <p>
          We retain account and Tenant data for as long as the account remains active, and for a
          reasonable period afterward to comply with legal, accounting, or reporting obligations.
          You may request deletion of your account by contacting us.
        </p>
      </section>

      <section>
        <h2>6. Your Rights</h2>
        <p>
          Depending on your location, you may have the right to access, correct, export, or delete
          your personal data. To exercise these rights, contact us at the email below.
        </p>
      </section>

      <section>
        <h2>7. Security</h2>
        <p>
          We use industry-standard measures — including encrypted connections, hashed passwords,
          and access controls — to protect your data. No method of transmission or storage is
          100% secure, and we cannot guarantee absolute security.
        </p>
      </section>

      <section>
        <h2>8. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. Material changes will be reflected
          by updating the "Last updated" date above.
        </p>
      </section>

      <section>
        <h2>9. Contact Us</h2>
        <p>
          Questions about this Privacy Policy can be sent to{' '}
          <a href="mailto:info@coursel.space">info@coursel.space</a>.
        </p>
      </section>
    </LegalLayout>
  );
}
