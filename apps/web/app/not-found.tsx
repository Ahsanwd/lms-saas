import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 text-center">
      <div className="max-w-md w-full">
        {/* Illustration */}
        <div className="flex justify-center mb-8">
          <div className="relative">
            <div className="w-32 h-32 rounded-full bg-primary-100 flex items-center justify-center">
              <svg
                className="w-16 h-16 text-primary-400"
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
            <span className="absolute -top-2 -right-2 text-4xl font-black text-primary-200 select-none">
              404
            </span>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-3">Page not found</h1>
        <p className="text-gray-500 mb-8 leading-relaxed">
          The page you&apos;re looking for doesn&apos;t exist or may have been moved.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center px-6 py-2.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
          >
            Go to Dashboard
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center px-6 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
