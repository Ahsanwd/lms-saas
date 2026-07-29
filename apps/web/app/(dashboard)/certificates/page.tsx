'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Spinner } from '@/components/ui';

interface MyCertificate {
  courseId: string;
  courseTitle: string;
  thumbnail: string | null;
  level: string | null;
  completedAt: string;
  issuedAt: string;
  certificateId: string;
  certificateRevoked: boolean;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

const LEVEL_BADGE: Record<string, string> = {
  beginner:     'bg-green-100 text-green-700',
  intermediate: 'bg-yellow-100 text-yellow-700',
  advanced:     'bg-red-100 text-red-700',
};

export default function MyCertificatesPage() {
  const { data, isLoading } = useQuery<MyCertificate[]>({
    queryKey: ['my-certificates'],
    queryFn: async () => {
      const { data } = await api.get('/courses/my-certificates');
      return data.data.certificates;
    },
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">My Certificates</h1>
        <p className="text-sm text-gray-500 mt-1">Certificates earned by completing courses</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-24"><Spinner size="lg" /></div>
      ) : !data?.length ? (
        <div className="bg-white border border-gray-200 rounded-2xl flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 bg-primary-50 rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
          </div>
          <p className="font-medium text-gray-900">No certificates yet</p>
          <p className="text-sm text-gray-500 mt-1">Complete a course to earn your first certificate.</p>
          <Link href="/courses"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700">
            Browse courses →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {data.map(cert => (
            <Link
              key={cert.courseId}
              href={`/certificates/${cert.courseId}`}
              className="group bg-white border border-gray-200 rounded-2xl overflow-hidden hover:shadow-md hover:border-primary-200 transition-all"
            >
              {/* Thumbnail / placeholder */}
              <div className="relative h-36 bg-gradient-to-br from-primary-50 to-primary-100 overflow-hidden">
                {cert.thumbnail ? (
                  <img src={cert.thumbnail} alt={cert.courseTitle}
                    className="w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg className="w-12 h-12 text-primary-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  </div>
                )}
                {/* Certificate badge overlay */}
                <div className={`absolute top-3 right-3 w-9 h-9 bg-white rounded-full shadow flex items-center justify-center ${cert.certificateRevoked ? 'text-red-600' : 'text-primary-600'}`}>
                  {cert.certificateRevoked ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                    </svg>
                  )}
                </div>
              </div>

              {/* Details */}
              <div className="px-4 py-3.5 space-y-2">
                <p className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2 group-hover:text-primary-700 transition-colors">
                  {cert.courseTitle}
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  {cert.certificateRevoked && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700">
                      Revoked
                    </span>
                  )}
                  {cert.level && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${LEVEL_BADGE[cert.level] ?? 'bg-gray-100 text-gray-600'}`}>
                      {cert.level}
                    </span>
                  )}
                  <span className="text-xs text-gray-400">Completed {formatDate(cert.completedAt)}</span>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs font-mono text-gray-400 truncate">{cert.certificateId}</span>
                  <span className="text-xs font-medium text-primary-600 group-hover:underline flex-shrink-0">
                    View →
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
