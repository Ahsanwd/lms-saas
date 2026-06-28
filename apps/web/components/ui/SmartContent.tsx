'use client';

import { HtmlContent } from './HtmlContent';
import { MarkdownContent } from './MarkdownContent';
import { cn } from '@/lib/utils';

interface SmartContentProps {
  content: string;
  className?: string;
}

// Detects whether content is HTML (from TipTap) or Markdown (legacy)
function isHtml(text: string): boolean {
  return text.trimStart().startsWith('<');
}

export function SmartContent({ content, className }: SmartContentProps) {
  if (!content?.trim()) return null;
  if (isHtml(content)) {
    return <HtmlContent content={content} className={cn('rich-content', className)} />;
  }
  return <MarkdownContent content={content} className={className} />;
}
