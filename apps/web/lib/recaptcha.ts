// reCAPTCHA v3 loader/executor — shared by any public, unauthenticated form
// that needs bot protection (tenant registration, the Contact Form section).

const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ?? '';

export function loadRecaptchaScript() {
  if (!RECAPTCHA_SITE_KEY || document.getElementById('recaptcha-script')) return;
  const s = document.createElement('script');
  s.id = 'recaptcha-script';
  s.src = `https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`;
  s.async = true;
  document.head.appendChild(s);
}

export async function executeRecaptcha(action: string): Promise<string> {
  if (!RECAPTCHA_SITE_KEY) return '';
  return new Promise((resolve) => {
    const attempt = () => {
      const gr = (window as any).grecaptcha;
      if (gr?.ready) {
        gr.ready(() => gr.execute(RECAPTCHA_SITE_KEY, { action }).then(resolve));
      } else {
        setTimeout(attempt, 300);
      }
    };
    attempt();
  });
}

export { RECAPTCHA_SITE_KEY };
