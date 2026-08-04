import type { GuideBlock } from '@/lib/guides';

export function GuideBlockRenderer({ blocks }: { blocks: GuideBlock[] }) {
  return (
    <div className="space-y-6">
      {blocks.map((block, i) => {
        if (block.type === 'p') {
          return (
            <p key={i} className="text-gray-600 leading-relaxed">
              {block.text}
            </p>
          );
        }

        if (block.type === 'steps') {
          return (
            <ol key={i} className="space-y-4">
              {block.items.map((item, idx) => (
                <li key={idx} className="flex items-start gap-4">
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                    {idx + 1}
                  </span>
                  <span className="text-gray-700 leading-relaxed pt-0.5">{item}</span>
                </li>
              ))}
            </ol>
          );
        }

        if (block.type === 'list') {
          return (
            <ul key={i} className="space-y-2.5">
              {block.items.map((item, idx) => (
                <li key={idx} className="flex items-start gap-3">
                  <svg className="w-4 h-4 mt-1 text-indigo-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-gray-700 leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
          );
        }

        return (
          <div key={i} className="flex items-start gap-3 bg-indigo-50 border border-indigo-100 rounded-xl p-4">
            <span className="text-lg flex-shrink-0">💡</span>
            <p className="text-sm text-indigo-900 leading-relaxed">{block.text}</p>
          </div>
        );
      })}
    </div>
  );
}
