'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to an error-reporting service in production
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 text-center">
      <div className="max-w-md w-full">
        <div className="flex justify-center mb-8">
          <div className="relative">
            <div className="w-32 h-32 rounded-full bg-red-50 flex items-center justify-center">
              <svg
                className="w-16 h-16 text-red-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <span className="absolute -top-2 -right-2 text-4xl font-black text-red-100 select-none">
              500
            </span>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-3">Something went wrong</h1>
        <p className="text-gray-500 mb-2 leading-relaxed">
          An unexpected error occurred. Our team has been notified.
        </p>
        {error?.digest && (
          <p className="text-xs text-gray-400 font-mono mb-6">Error ID: {error.digest}</p>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center mt-6">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center px-6 py-2.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
          >
            Try again
          </button>
          <a
            href="/dashboard"
            className="inline-flex items-center justify-center px-6 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            Go to Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
