const axios = require('axios');
const logger = require('../../utils/logger');

// Adds/updates a contact in a Brevo marketing list (distinct from the
// transactional smtp/email API in services/email/email.service.js). Soft-skips
// if BREVO_MARKETING_LIST_ID isn't configured — same convention as
// utils/recaptcha.js for optional third-party integrations, since the drip
// sequence itself runs on our own Bull queue and doesn't depend on this list
// existing.
async function addContactToList(email, { name } = {}) {
  const apiKey = process.env.BREVO_API_KEY;
  const listId = process.env.BREVO_MARKETING_LIST_ID;
  if (!apiKey || !listId) return false;

  try {
    await axios.post(
      'https://api.brevo.com/v3/contacts',
      {
        email,
        attributes: name ? { FIRSTNAME: name } : undefined,
        listIds: [Number(listId)],
        updateEnabled: true,
      },
      {
        headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
        timeout: 15000,
      }
    );
    return true;
  } catch (err) {
    logger.error(`Brevo contact upsert failed for ${email}: ${err.response?.data?.message || err.message}`);
    return false;
  }
}

module.exports = { addContactToList };
