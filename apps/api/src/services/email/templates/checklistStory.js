const { emailLayout } = require('./emailLayout');

module.exports = () => ({
  subject: 'Why Stripe was never the real problem',
  html: emailLayout({
    tenantName: 'Coursel',
    body: `
      <h2 style="margin:0 0 8px;font-size:19px;color:#111827">Why Stripe was never the real problem</h2>
      <p style="color:#111827;margin:0 0 16px;line-height:1.7">
        Almost every course platform out there — Thinkific, Teachable, Kajabi — was built assuming its
        customers had a US or UK bank account. Stripe doesn't operate in Pakistan, so the moment a
        Pakistani coach tried to actually get paid, the platform quietly stopped working for them.
      </p>
      <p style="color:#111827;margin:0 0 16px;line-height:1.7">
        That's not a "you" problem. It's not a skills gap, and it's definitely not a sign your course
        idea wasn't good enough. It's a payments gap — and it's a solvable one.
      </p>
      <p style="color:#111827;margin:0 0 16px;line-height:1.7">
        You don't need a gateway that "supports Pakistan" at all. Bank transfer, JazzCash, and
        EasyPaisa already move money into Pakistani accounts every day — the only thing missing was a
        course platform that let you use them directly instead of forcing Stripe as the only option.
      </p>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px 20px;margin:20px 0">
        <p style="margin:0;color:#111827;font-size:14px;line-height:1.6">
          <strong>From the checklist, Stage 3:</strong> "Pick a platform that lets students pay you
          directly by bank transfer, JazzCash, or EasyPaisa — you approve each payment yourself, no
          gateway approval to wait on." That one line is the difference between a course that sits
          unfinished and one that has paying students.
        </p>
      </div>
      <p style="color:#6b7280;font-size:13px;margin:20px 0 0">Next up: the two objections that stop people right before they switch platforms — and why neither one holds up.</p>
    `,
  }),
});
