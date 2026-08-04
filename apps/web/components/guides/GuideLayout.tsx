import Link from 'next/link';

export function GuideLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <nav className="sticky top-0 z-50 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-indigo-600 tracking-tight">
            Coursel
          </Link>
          <Link href="/" className="text-sm font-medium text-gray-600 hover:text-indigo-600 transition-colors">
            Back to home
          </Link>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-14">{children}</main>

      <footer className="py-10 px-6 border-t border-gray-100 bg-white">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-400">
          <span className="font-semibold text-indigo-600">Coursel</span>
          <span>© {new Date().getFullYear()} Coursel. All rights reserved.</span>
          <div className="flex gap-6">
            <Link href="/guides" className="hover:text-gray-600 transition-colors">Guides</Link>
            <Link href="/privacy" className="hover:text-gray-600 transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-gray-600 transition-colors">Terms</Link>
            <Link href="/refund-policy" className="hover:text-gray-600 transition-colors">Refunds</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
