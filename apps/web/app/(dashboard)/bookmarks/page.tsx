'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import api from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';

interface BookmarkedCourse {
  _id: string;
  courseId: {
    _id: string;
    title: string;
    thumbnail?: string;
    price: number;
    isFree: boolean;
    enrollmentCount: number;
    status: string;
    level: string;
  } | null;
  createdAt: string;
}

function fmt$(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export default function BookmarksPage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['bookmarks'],
    queryFn: async () => {
      const res = await api.get('/bookmarks');
      return res.data.data.bookmarks as BookmarkedCourse[];
    },
  });

  const removeMutation = useMutation({
    mutationFn: (courseId: string) => api.delete(`/bookmarks/${courseId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bookmarks'] }),
  });

  const bookmarks = data ?? [];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Saved Courses</h1>
        <p className="text-sm text-gray-500 mt-0.5">Courses you've bookmarked for later</p>
      </div>

      {isLoading && (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      )}

      {!isLoading && bookmarks.length === 0 && (
        <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          </div>
          <p className="text-gray-900 font-medium">No saved courses yet</p>
          <p className="text-sm text-gray-500 mt-1">Bookmark courses you want to revisit later.</p>
          <Link href="/courses" className="mt-4 inline-block text-sm text-primary-600 font-medium hover:underline">
            Browse Courses →
          </Link>
        </div>
      )}

      {bookmarks.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {bookmarks.map(b => {
            const course = b.courseId;
            if (!course) return null;
            return (
              <div key={b._id} className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow group">
                {/* Thumbnail */}
                <div className="relative aspect-video bg-gray-100">
                  {course.thumbnail ? (
                    <img src={course.thumbnail} alt={course.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253" />
                      </svg>
                    </div>
                  )}
                  {/* Remove button */}
                  <button
                    onClick={() => removeMutation.mutate(course._id)}
                    disabled={removeMutation.isPending}
                    title="Remove bookmark"
                    className="absolute top-2 right-2 w-7 h-7 bg-white/90 rounded-full flex items-center justify-center text-gray-500 hover:text-red-500 hover:bg-white shadow-sm transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                    </svg>
                  </button>
                </div>

                {/* Info */}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="text-sm font-semibold text-gray-900 line-clamp-2 flex-1">{course.title}</h3>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400 capitalize">{course.level}</span>
                    <span className="text-sm font-bold text-gray-900">
                      {course.isFree ? <span className="text-green-600">Free</span> : fmt$(course.price * 100)}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-gray-400">{course.enrollmentCount} students</span>
                    <Badge variant={course.status === 'published' ? 'success' : 'default'}>
                      {course.status}
                    </Badge>
                  </div>

                  <Link
                    href={`/courses/${course._id}`}
                    className="mt-3 block w-full text-center text-sm font-medium text-primary-600 hover:text-primary-700 py-2 border border-primary-200 rounded-lg hover:bg-primary-50 transition-colors"
                  >
                    View Course
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
