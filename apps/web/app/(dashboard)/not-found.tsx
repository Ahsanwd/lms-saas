import Link from 'next/link';

export default function DashboardNotFound() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-20 text-center">
      <div className="max-w-sm w-full">
        <div className="flex justify-center mb-6">
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center">
              <svg
                className="w-12 h-12 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <span className="absolute -top-1 -right-3 text-3xl font-black text-gray-200 select-none">
              404
            </span>
          </div>
        </div>

        <h1 className="text-xl font-bold text-gray-900 mb-2">Page not found</h1>
        <p className="text-sm text-gray-500 mb-6 leading-relaxed">
          This page doesn&apos;t exist or you don&apos;t have permission to view it.
        </p>

        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
