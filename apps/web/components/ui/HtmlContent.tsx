'use client';

import { useMemo, useId } from 'react';
import { cn } from '@/lib/utils';

interface HtmlContentProps {
  content: string;
  className?: string;
}

// ── Extract <style> blocks, return CSS + remaining HTML ───────────────────────
function extractStyles(html: string): { css: string; html: string } {
  const cssChunks: string[] = [];
  const stripped = html.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (_, css) => {
    cssChunks.push(css);
    return '';
  });
  return { css: cssChunks.join('\n'), html: stripped };
}

// ── Scope every CSS rule to `.scope` so it can't leak outside the container ──
function scopeCss(css: string, scope: string): string {
  // Remove comments
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');

  const result: string[] = [];
  // Match @media blocks, @keyframes blocks, and regular rules
  const ruleRegex = /(@media\s[^{]+)\{([\s\S]*?)\}\s*\}/g
    || /([^@{}]+)\{([^}]*)\}/g;

  // Process @media blocks (scope inner rules)
  css = css.replace(/(@media\s[^{]+)\{([\s\S]*?)\n?\}/g, (_, mediaQuery, innerCss) => {
    const scopedInner = innerCss.replace(/([^{}]+)\{([^}]*)\}/g, (_: string, sel: string, rules: string) => {
      const scoped = scopeSelectors(sel, scope);
      return scoped ? `${scoped} { ${rules} }` : '';
    });
    result.push(`${mediaQuery} { ${scopedInner} }`);
    return '';
  });

  // Process @keyframes (keep as-is, no scoping needed)
  css = css.replace(/@keyframes\s+\S+\s*\{[\s\S]*?\n?\}/g, (match) => {
    result.push(match);
    return '';
  });

  // Process remaining regular rules
  css.replace(/([^{}]+)\{([^}]*)\}/g, (_: string, selectors: string, rules: string) => {
    const scoped = scopeSelectors(selectors, scope);
    if (scoped) result.push(`${scoped} { ${rules} }`);
    return '';
  });

  return result.join('\n');
}

function scopeSelectors(selectors: string, scope: string): string {
  return selectors
    .split(',')
    .map(s => {
      const t = s.trim();
      if (!t) return '';
      // Skip @-rules that slipped through
      if (t.startsWith('@')) return t;
      // :root → scoped container
      if (t === ':root') return `.${scope}`;
      return `.${scope} ${t}`;
    })
    .filter(Boolean)
    .join(', ');
}

// ── Sanitize HTML (style tags already extracted) ──────────────────────────────
function sanitizeHtml(html: string): string {
  if (typeof window === 'undefined') return html;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const DOMPurify = require('dompurify');
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'h1','h2','h3','h4','h5','h6','p','br','strong','em','u','s','del',
      'ul','ol','li','blockquote','pre','code','a','img','hr','table',
      'thead','tbody','tr','th','td','span','div','section','article',
      'header','footer','figure','figcaption','picture','source',
    ],
    ALLOWED_ATTR: [
      'href','target','rel','src','alt','class','id','style',
      'width','height','srcset','loading','title','data-*',
    ],
    ALLOW_DATA_ATTR: true,
    // Block dangerous CSS inside style attributes
    FORBID_CSS_PATTERNS: [/expression\(/i, /javascript:/i],
  });
}

// ── Sanitize extracted CSS (block dangerous patterns) ────────────────────────
function sanitizeCss(css: string): string {
  return css
    .replace(/expression\s*\(/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/@import\s/gi, '/* @import removed */ ')
    .replace(/behavior\s*:/gi, '');
}

export function HtmlContent({ content, className }: HtmlContentProps) {
  const rawId = useId();
  // useId returns ":r0:" style — convert to valid CSS class
  const scope = `hc-${rawId.replace(/[^a-z0-9]/gi, '')}`;

  const { scopedCss, cleanHtml } = useMemo(() => {
    if (!content?.trim()) return { scopedCss: '', cleanHtml: '' };
    const { css, html } = extractStyles(content);
    const safeCss  = css  ? scopeCss(sanitizeCss(css), scope) : '';
    const safeHtml = sanitizeHtml(html);
    return { scopedCss: safeCss, cleanHtml: safeHtml };
  }, [content, scope]);

  if (!cleanHtml && !scopedCss) return null;

  return (
    <div className={cn('rich-content', scope, className)}>
      {scopedCss && (
        <style
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: scopedCss }}
        />
      )}
      <div dangerouslySetInnerHTML={{ __html: cleanHtml }} />
    </div>
  );
}
