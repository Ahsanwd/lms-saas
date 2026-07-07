'use client';

interface ReorderControlsProps {
  index: number;
  length: number;
  onMove: (direction: -1 | 1) => void;
  className?: string;
}

// Up/down arrow pair for reordering an item within a list. Disabled at the
// boundaries. Pair with lib/utils.ts's moveArrayItem for the actual swap.
export function ReorderControls({ index, length, onMove, className }: ReorderControlsProps) {
  return (
    <div className={`flex items-center gap-0.5 flex-shrink-0 ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => onMove(-1)}
        disabled={index === 0}
        className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Move up"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => onMove(1)}
        disabled={index === length - 1}
        className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Move down"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
    </div>
  );
}
