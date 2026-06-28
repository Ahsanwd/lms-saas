'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface HtmlContentProps {
  content: string;
  className?: string;
}

function sanitize(html: string): string {
  if (typeof window === 'undefined') return html;
  // Dynamically import DOMPurify (client-only)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const DOMPurify = require('dompurify');
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'h1','h2','h3','h4','h5','h6','p','br','strong','em','u','s','del',
      'ul','ol','li','blockquote','pre','code','a','img','hr','table',
      'thead','tbody','tr','th','td','span','div','figure','figcaption',
    ],
    ALLOWED_ATTR: ['href','target','rel','src','alt','class','style','width','height'],
    ALLOW_DATA_ATTR: false,
  });
}

export function HtmlContent({ content, className }: HtmlContentProps) {
  const clean = useMemo(() => sanitize(content ?? ''), [content]);

  if (!clean) return null;

  return (
    <div
      className={cn('rich-content', className)}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
