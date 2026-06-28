'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import { useState, useEffect, useCallback } from 'react';
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

// ── Toolbar icon helper ───────────────────────────────────────────────────────
function ToolBtn({
  onClick, active, disabled, title, children,
}: {
  onClick: () => void; active?: boolean; disabled?: boolean; title: string; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      disabled={disabled}
      title={title}
      className={cn(
        'p-1.5 rounded text-sm leading-none transition-colors select-none',
        active
          ? 'bg-primary-100 text-primary-700'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
        disabled && 'opacity-30 cursor-not-allowed',
      )}
    >
      {children}
    </button>
  );
}

const COLORS = ['#000000', '#374151', '#DC2626', '#D97706', '#059669', '#2563EB', '#7C3AED', '#DB2777'];

export function RichTextEditor({
  value, onChange, placeholder = 'Write something…', minHeight = 200, error, label, required,
}: RichTextEditorProps) {
  const [mode, setMode] = useState<'visual' | 'html'>('visual');
  const [rawHtml, setRawHtml] = useState(value ?? '');
  const [showColors, setShowColors] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      Link.configure({ openOnClick: false, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder }),
      TextStyle,
      Color,
    ],
    content: value ?? '',
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      setRawHtml(html);
      onChange(html);
    },
    editorProps: {
      attributes: {
        class: 'focus:outline-none px-4 py-3',
        style: `min-height:${minHeight}px`,
      },
    },
  });

  // Sync external value changes (e.g. form reset / load from API)
  useEffect(() => {
    if (!editor) return;
    if (mode === 'visual') {
      const current = editor.getHTML();
      if (value !== current) editor.commands.setContent(value ?? '');
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  // Switch modes
  function switchToHtml() {
    if (!editor) return;
    setRawHtml(editor.getHTML());
    setMode('html');
  }

  function switchToVisual() {
    if (!editor) return;
    editor.commands.setContent(rawHtml);
    onChange(rawHtml);
    setMode('visual');
  }

  const setLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('URL', prev ?? 'https://');
    if (url === null) return;
    if (url === '') { editor.chain().focus().extendMarkRange('link').unsetLink().run(); return; }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

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
        <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-gray-200 bg-gray-50">

          {/* Mode toggle */}
          <div className="flex rounded-md overflow-hidden border border-gray-200 mr-2">
            <button
              type="button"
              onClick={() => mode === 'html' ? switchToVisual() : undefined}
              className={cn('px-2.5 py-1 text-xs font-medium transition-colors', mode === 'visual' ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100')}
            >
              Visual
            </button>
            <button
              type="button"
              onClick={() => mode === 'visual' ? switchToHtml() : undefined}
              className={cn('px-2.5 py-1 text-xs font-medium transition-colors border-l border-gray-200', mode === 'html' ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100')}
            >
              HTML
            </button>
          </div>

          {mode === 'visual' && editor && (
            <>
              {/* Heading */}
              <select
                value={
                  editor.isActive('heading', { level: 1 }) ? '1'
                  : editor.isActive('heading', { level: 2 }) ? '2'
                  : editor.isActive('heading', { level: 3 }) ? '3'
                  : '0'
                }
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (v === 0) editor.chain().focus().setParagraph().run();
                  else editor.chain().focus().toggleHeading({ level: v as 1|2|3 }).run();
                }}
                className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white text-gray-600 focus:outline-none mr-1"
              >
                <option value="0">Paragraph</option>
                <option value="1">H1</option>
                <option value="2">H2</option>
                <option value="3">H3</option>
              </select>

              <div className="w-px h-5 bg-gray-200 mx-1" />

              {/* Bold / Italic / Underline / Strike */}
              <ToolBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold">
                <strong className="font-bold text-xs">B</strong>
              </ToolBtn>
              <ToolBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic">
                <em className="text-xs">I</em>
              </ToolBtn>
              <ToolBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline">
                <span className="underline text-xs">U</span>
              </ToolBtn>
              <ToolBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough">
                <span className="line-through text-xs">S</span>
              </ToolBtn>

              <div className="w-px h-5 bg-gray-200 mx-1" />

              {/* Lists */}
              <ToolBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet list">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
              </ToolBtn>
              <ToolBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Numbered list">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h10M7 16h10M3 8h.01M3 12h.01M3 16h.01" /></svg>
              </ToolBtn>

              <div className="w-px h-5 bg-gray-200 mx-1" />

              {/* Align */}
              <ToolBtn onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Align left">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h10M4 18h16" /></svg>
              </ToolBtn>
              <ToolBtn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Center">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M7 12h10M4 18h16" /></svg>
              </ToolBtn>
              <ToolBtn onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Align right">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M10 12h10M4 18h16" /></svg>
              </ToolBtn>

              <div className="w-px h-5 bg-gray-200 mx-1" />

              {/* Link */}
              <ToolBtn onClick={setLink} active={editor.isActive('link')} title="Insert link">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
              </ToolBtn>

              {/* Blockquote */}
              <ToolBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Blockquote">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
              </ToolBtn>

              {/* Code */}
              <ToolBtn onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')} title="Inline code">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
              </ToolBtn>

              <div className="w-px h-5 bg-gray-200 mx-1" />

              {/* Color picker */}
              <div className="relative">
                <ToolBtn onClick={() => setShowColors(v => !v)} title="Text color">
                  <span className="text-xs font-bold" style={{ color: editor.getAttributes('textStyle').color || '#000' }}>A</span>
                </ToolBtn>
                {showColors && (
                  <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-2 z-20 flex flex-wrap gap-1 w-[120px]">
                    {COLORS.map(c => (
                      <button
                        key={c}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().setColor(c).run(); setShowColors(false); }}
                        className="w-6 h-6 rounded border border-gray-200 hover:scale-110 transition-transform"
                        style={{ background: c }}
                        title={c}
                      />
                    ))}
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().unsetColor().run(); setShowColors(false); }}
                      className="w-full text-[10px] text-gray-500 hover:text-gray-800 mt-0.5"
                    >
                      Reset color
                    </button>
                  </div>
                )}
              </div>

              <div className="w-px h-5 bg-gray-200 mx-1" />

              {/* Undo / Redo */}
              <ToolBtn onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
              </ToolBtn>
              <ToolBtn onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" /></svg>
              </ToolBtn>
            </>
          )}
        </div>

        {/* ── Editor area ── */}
        {mode === 'visual' ? (
          <EditorContent editor={editor} onClick={() => setShowColors(false)} />
        ) : (
          <textarea
            value={rawHtml}
            onChange={(e) => {
              setRawHtml(e.target.value);
              onChange(e.target.value);
            }}
            className="w-full px-4 py-3 font-mono text-xs text-gray-800 bg-gray-950 text-green-400 focus:outline-none resize-none"
            style={{ minHeight: `${minHeight}px` }}
            spellCheck={false}
            placeholder="<p>Write HTML here…</p>"
          />
        )}
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
