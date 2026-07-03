import type { Metadata } from 'next';
import { LegalLayout } from '@/components/legal/LegalLayout';

export const metadata: Metadata = {
  title: 'Refund Policy — Coursel',
};

export default function RefundPolicyPage() {
  return (
    <LegalLayout title="Refund Policy" lastUpdated="June 30, 2026">
      <p>
        This Refund Policy covers two separate types of payments made on Coursel: (1) your
        school's subscription to the Coursel platform, and (2) course payments made by students
        to an individual school.
      </p>

      <section>
        <h2>1. Coursel Subscription Fees (Basic / Pro plans)</h2>
        <ul>
          <li>Every new school starts with a 14-day free trial — you are not charged until the trial ends and you choose to subscribe.</li>
          <li>Subscription fees are billed in advance for the period selected (monthly or yearly) and are non-refundable once a billing period has started, except where required by law.</li>
          <li>If you cancel, you keep access until the end of your current billing period — we do not provide partial-period refunds for early cancellation.</li>
          <li>Billing and payments for subscriptions are processed by Lemon Squeezy, our merchant of record. Refund eligibility for processing or billing errors may also be reviewed under Lemon Squeezy's own policies.</li>
          <li>Exceptions (e.g. duplicate charges, proven billing errors) are handled at our discretion — contact us at the email below.</li>
        </ul>
      </section>

      <section>
        <h2>2. Course Payments (Student → School)</h2>
        <p>
          When a student purchases a course from a school hosted on Coursel, that purchase is
          between the student and the school (Tenant) — Coursel facilitates the transaction but
          is not the seller of course content.
        </p>
        <ul>
          <li>Each school sets its own refund window for course purchases (30 days by default, configurable by the school).</li>
          <li>To request a refund for a course, students should use the refund request option on the course/payment within their school's portal.</li>
          <li>The school's admin reviews each refund request and may approve it in full, approve it partially, or decline it.</li>
          <li>Approved refunds are processed back to the original payment method through the payment provider used at checkout (Stripe).</li>
        </ul>
      </section>

      <section>
        <h2>3. How to Request a Refund</h2>
        <ul>
          <li><strong>Subscription billing issue:</strong> email <a href="mailto:support@coursel.space">support@coursel.space</a> with your school's subdomain and billing details.</li>
          <li><strong>Course purchase:</strong> submit a refund request from inside the course/payment page on your school's portal, or contact the school directly.</li>
        </ul>
      </section>

      <section>
        <h2>4. Changes to This Policy</h2>
        <p>
          We may update this Refund Policy from time to time. Material changes will be reflected
          by updating the "Last updated" date above.
        </p>
      </section>
    </LegalLayout>
  );
}
