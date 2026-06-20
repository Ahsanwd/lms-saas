'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import type { ComponentPropsWithoutRef } from 'react';

interface MarkdownContentProps {
  content: string;
  className?: string;
}

export function MarkdownContent({ content, className }: MarkdownContentProps) {
  return (
    <div className={cn('lesson-markdown', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-2xl font-bold text-gray-900 mt-6 mb-3 pb-2 border-b border-gray-200 first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xl font-bold text-gray-800 mt-5 mb-2.5 first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-lg font-semibold text-gray-800 mt-4 mb-2 first:mt-0">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-base font-semibold text-gray-700 mt-3 mb-1.5 first:mt-0">
              {children}
            </h4>
          ),
          p: ({ children }) => (
            <p className="text-gray-700 leading-7 mb-4 last:mb-0" style={{ fontSize: '15px' }}>
              {children}
            </p>
          ),
          strong: ({ children }) => (
            <strong className="font-bold text-gray-900">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-gray-700">{children}</em>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-outside pl-6 mb-4 space-y-1.5 text-gray-700" style={{ fontSize: '15px' }}>
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-outside pl-6 mb-4 space-y-1.5 text-gray-700" style={{ fontSize: '15px' }}>
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-7">{children}</li>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-indigo-300 pl-4 py-1 my-4 bg-indigo-50 rounded-r-lg text-gray-600 italic">
              {children}
            </blockquote>
          ),
          // pre wraps fenced code blocks — handle the full block here
          pre: ({ children }) => (
            <pre className="bg-gray-900 text-gray-100 rounded-xl p-4 text-sm font-mono overflow-x-auto mb-4 leading-6 whitespace-pre">
              {children}
            </pre>
          ),
          // code is called for both inline and block (inside pre)
          code: ({ className: cls, children }: ComponentPropsWithoutRef<'code'>) => {
            const isBlock = Boolean(cls && cls.startsWith('language-'));
            if (isBlock) {
              return <code className={cn('block', cls)}>{children}</code>;
            }
            return (
              <code className="bg-gray-100 text-indigo-600 rounded px-1.5 py-0.5 text-[13px] font-mono">
                {children}
              </code>
            );
          },
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 underline hover:text-indigo-800 transition-colors"
            >
              {children}
            </a>
          ),
          hr: () => <hr className="my-6 border-gray-200" />,
          table: ({ children }) => (
            <div className="overflow-x-auto mb-4">
              <table className="min-w-full border border-gray-200 rounded-lg text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-gray-50 text-gray-600 font-semibold">{children}</thead>
          ),
          tbody: ({ children }) => <tbody className="divide-y divide-gray-100">{children}</tbody>,
          tr: ({ children }) => <tr className="hover:bg-gray-50 transition-colors">{children}</tr>,
          th: ({ children }) => (
            <th className="px-4 py-2.5 text-left font-semibold border-b border-gray-200">{children}</th>
          ),
          td: ({ children }) => <td className="px-4 py-2.5 text-gray-700">{children}</td>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
