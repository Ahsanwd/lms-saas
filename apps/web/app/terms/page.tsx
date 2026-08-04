import type { Metadata } from 'next';
import { LegalLayout } from '@/components/legal/LegalLayout';

export const metadata: Metadata = {
  title: 'Terms of Service — Coursel',
};

export default function TermsOfServicePage() {
  return (
    <LegalLayout title="Terms of Service" lastUpdated="June 30, 2026">
      <p>
        These Terms of Service ("Terms") govern your access to and use of Coursel
        (coursel.space and all Tenant subdomains). By creating an account or using the
        platform, you agree to these Terms.
      </p>

      <section>
        <h2>1. Accounts</h2>
        <p>
          You must provide accurate information when creating an account and are responsible
          for maintaining the confidentiality of your login credentials and all activity under
          your account.
        </p>
      </section>

      <section>
        <h2>2. Plans, Trials &amp; Billing</h2>
        <ul>
          <li>New schools (Tenants) start with a 14-day free trial. No credit card is required to start a trial.</li>
          <li>After the trial, continued use requires an active paid subscription (Basic or Pro plan).</li>
          <li>Subscriptions are billed monthly or yearly in advance through Lemon Squeezy, our authorized reseller and merchant of record.</li>
          <li>Plan limits (students, instructors, courses, storage) are described on our pricing page and enforced automatically.</li>
          <li>We may change pricing with reasonable advance notice; changes apply to future billing cycles, not the current paid period.</li>
        </ul>
      </section>

      <section>
        <h2>3. Tenant Responsibilities</h2>
        <p>
          Tenant Admins are responsible for the content uploaded to their school, for managing
          their instructors and students, and for complying with applicable laws (including
          consumer protection and data privacy laws) for their own end users. Coursel acts as a
          platform provider and is not a party to the relationship between a Tenant and its students.
        </p>
      </section>

      <section>
        <h2>4. Acceptable Use</h2>
        <p>You agree not to use Coursel to:</p>
        <ul>
          <li>Upload or sell unlawful, infringing, fraudulent, or harmful content.</li>
          <li>Attempt to gain unauthorized access to other Tenants' data or our systems.</li>
          <li>Interfere with or disrupt the platform's availability or security.</li>
          <li>Resell or sublicense the platform itself without our written consent.</li>
        </ul>
      </section>

      <section>
        <h2>5. Intellectual Property</h2>
        <p>
          Tenants retain ownership of the course content they create and upload. Coursel retains
          all rights to the platform's software, design, and branding. By uploading content, you
          grant us a limited license to host, store, and deliver that content as necessary to
          operate the service.
        </p>
      </section>

      <section>
        <h2>6. Suspension &amp; Termination</h2>
        <p>
          We may suspend or terminate accounts that violate these Terms, fail to pay applicable
          fees, or pose a security risk to the platform or other Tenants. You may cancel your
          subscription at any time; access continues until the end of the current billing period.
        </p>
      </section>

      <section>
        <h2>7. Disclaimers &amp; Limitation of Liability</h2>
        <p>
          The platform is provided "as is" without warranties of any kind. To the maximum extent
          permitted by law, Coursel is not liable for indirect, incidental, or consequential
          damages arising from use of the platform.
        </p>
      </section>

      <section>
        <h2>8. Refunds</h2>
        <p>
          Subscription refunds are governed by our{' '}
          <a href="/refund-policy">Refund Policy</a>.
        </p>
      </section>

      <section>
        <h2>9. Changes to These Terms</h2>
        <p>
          We may update these Terms from time to time. Continued use of the platform after
          changes take effect constitutes acceptance of the updated Terms.
        </p>
      </section>

      <section>
        <h2>10. Contact Us</h2>
        <p>
          Questions about these Terms can be sent to{' '}
          <a href="mailto:info@coursel.space">info@coursel.space</a>.
        </p>
      </section>
    </LegalLayout>
  );
}
