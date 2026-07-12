'use client';

import { cn } from '@/lib/utils';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  error?: string;
  label?: string;
  required?: boolean;
}

export function RichTextEditor({
  value, onChange, placeholder = 'Write HTML here…', minHeight = 220, error, label, required,
}: RichTextEditorProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}

      <div className={cn(
        'rounded-lg border overflow-hidden bg-white transition-colors',
        error ? 'border-red-400' : 'border-gray-300 focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500',
      )}>
        {/* ── Toolbar ── */}
        <div className="flex items-center gap-3 px-3 py-1.5 border-b border-gray-200 bg-gray-50">
          <span className="text-xs font-medium text-gray-500">HTML + CSS</span>
          <span className="text-xs text-gray-400 hidden sm:block">
            Write HTML + CSS — supports &lt;style&gt; tags and class attributes
          </span>
        </div>

        {/* ── Content area ── */}
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-4 py-3 font-mono text-[13px] leading-relaxed bg-gray-950 text-green-400 focus:outline-none resize-y"
          style={{ minHeight: `${minHeight}px` }}
          spellCheck={false}
          placeholder={placeholder || `<style>\n  .hero { background: #1e40af; }\n</style>\n\n<div class="hero">\n  <h1>Hello</h1>\n</div>`}
        />
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
