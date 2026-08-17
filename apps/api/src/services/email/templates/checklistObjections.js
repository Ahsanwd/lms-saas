const { emailLayout } = require('./emailLayout');

module.exports = () => ({
  subject: '"But I don’t have time/money to switch platforms"',
  html: emailLayout({
    tenantName: 'Coursel',
    body: `
      <h2 style="margin:0 0 8px;font-size:19px;color:#111827">"But I don't have time or money for this"</h2>
      <p style="color:#111827;margin:0 0 16px;line-height:1.7">Two objections come up every time someone gets to Stage 3. Neither one holds up once you look at it closely.</p>

      <p style="margin:0 0 6px;color:#111827;font-weight:700;font-size:15px">"It'll cost too much"</p>
      <p style="color:#111827;margin:0 0 16px;line-height:1.7">
        Coursel starts at $29/mo — less than most of the "budget" international platforms, and with no
        setup fee and no foreign company requirement stacked on top. You keep everything you'd expect:
        courses, quizzes, certificates, your own branded page.
      </p>

      <p style="margin:0 0 6px;color:#111827;font-weight:700;font-size:15px">"It'll take too long to set up"</p>
      <p style="color:#111827;margin:0 0 16px;line-height:1.7">
        Signing up, branding your page, and connecting a payment gateway takes under a day — no
        developer, no code, no waiting on approval from a platform that was never going to say yes.
      </p>

      <p style="color:#111827;margin:0 0 16px;line-height:1.7">
        The honest cost isn't switching platforms. It's the months a course sits finished but unsold
        because Stage 3 never got solved.
      </p>
      <p style="color:#6b7280;font-size:13px;margin:20px 0 0">Last email tomorrow — a direct way to try this yourself, no card required.</p>
    `,
  }),
});
