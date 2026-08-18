const { emailLayout } = require('./emailLayout');

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const STAGES = [
  {
    title: 'Stage 1 — Validate the idea',
    items: [
      'Narrow to one specific problem you can solve',
      'Ask 10 people in your niche if they’d pay for this — not just "would you take this"',
      'Check that 2–3 people already teach something similar (real demand, not a warning sign)',
    ],
  },
  {
    title: 'Stage 2 — Build the course',
    items: [
      'Outline modules and lessons before recording anything',
      'Record in short lessons, 8–15 minutes each',
      'Price in both PKR and USD',
      'Add one downloadable resource per module',
    ],
  },
  {
    title: 'Stage 3 — Get paid (the part that stops most people)',
    items: [
      'Drop the assumption that you need a US/UK company to sell online — you don’t',
      'Pick a platform that lets students pay you directly by bank transfer, JazzCash, or EasyPaisa — no gateway approval to wait on',
      'Test the full flow yourself first: transfer, upload proof, approve it, confirm enrollment unlocks',
      'Decide how fast you’ll review and approve payments — slow approval is the #1 way this flow frustrates students',
    ],
    highlight: true,
  },
  {
    title: 'Stage 4 — Build your launch page',
    items: [
      'Write the page around the outcome, not the curriculum',
      'Show your face and a short bio',
      'Add 2–3 testimonials, even from free beta students',
      'Test the buy button yourself, on mobile, before announcing anything',
    ],
  },
  {
    title: 'Stage 5 — Get your first students',
    items: [
      'Post value, not ads, in 3–5 Facebook groups where your audience gathers',
      'Build an email list before launch day, not after',
      'Offer a founding-cohort discount for your first 10–20 students',
      'Personally message the first 10 people who show interest',
    ],
  },
  {
    title: 'Stage 6 — After you launch',
    items: [
      'Give students a simple way to ask questions',
      'Issue a certificate on completion',
      'Ask every completed student for a testimonial while it’s fresh',
      'Revisit your price after the first 20 sales',
    ],
  },
];

function renderStage(stage) {
  const items = stage.items
    .map((item) => `<tr><td style="padding:4px 0;color:#111827;font-size:14px;line-height:1.6">&#9744;&nbsp; ${escapeHtml(item)}</td></tr>`)
    .join('');
  const bg = stage.highlight ? '#FEF3E2' : '#f9fafb';
  const border = stage.highlight ? '#F3D8A6' : '#e5e7eb';
  return `
    <div style="background:${bg};border:1px solid ${border};border-radius:10px;padding:16px 20px;margin-bottom:14px">
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#111827;text-transform:uppercase;letter-spacing:0.04em">${escapeHtml(stage.title)}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items}</table>
    </div>`;
}

module.exports = ({ name }) => ({
  subject: 'Here’s your checklist (+ the one stage most people skip)',
  html: emailLayout({
    tenantName: 'Coursel',
    body: `
      <h2 style="margin:0 0 8px;font-size:19px;color:#111827">Hey${name ? ` ${escapeHtml(name)}` : ''} — here’s your full checklist</h2>
      <p style="color:#6b7280;margin:0 0 20px">All 24 items, in order, from validating your idea to your first paying student.</p>
      ${STAGES.map(renderStage).join('')}
      <p style="color:#6b7280;font-size:13px;margin:20px 0 0">More on Stage 3 in your next email — it’s the one that quietly stops most Pakistani course creators before they ever launch.</p>
    `,
  }),
});
