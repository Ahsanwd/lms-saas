'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button, Spinner } from '@/components/ui';

interface CertTemplate {
  organizationName?: string;
  logoUrl?: string | null;
  heading?: string;
  subheading?: string;
  bodyText?: string;
  footerNote?: string;
  signatoryName?: string;
  signatoryTitle?: string;
  signatureImageUrl?: string | null;
  secondSignatoryName?: string;
  secondSignatoryTitle?: string;
  secondSignatureImageUrl?: string | null;
  accentColor?: string;
  backgroundColor?: string;
  backgroundImageUrl?: string | null;
  borderStyle?: 'classic' | 'modern' | 'minimal' | 'elegant';
  fontFamily?: 'serif' | 'sans' | 'elegant';
  nameFontSize?: number;
  titleFontSize?: number;
  showBadge?: boolean;
}

interface CertificateData {
  certificateId: string;
  studentName: string;
  courseTitle: string;
  instructorName: string;
  completedAt: string;
  issuedAt: string;
  expiresAt?: string | null;
  template?: CertTemplate | null;
}

const FONT_MAP: Record<string, string> = {
  serif:   'Georgia, Times New Roman, serif',
  sans:    'Inter, system-ui, sans-serif',
  elegant: 'Palatino Linotype, Book Antiqua, serif',
};

function formatLongDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

function LinkedInShareButton({ courseTitle, issuedAt, certId }: {
  courseTitle: string; issuedAt: string; certId: string;
}) {
  const issueYear  = new Date(issuedAt).getFullYear();
  const issueMonth = new Date(issuedAt).getMonth() + 1;
  const verifyUrl  = typeof window !== 'undefined'
    ? `${window.location.origin}/verify/${certId}`
    : '';

  const params = new URLSearchParams({
    startTask: 'CERTIFICATION_NAME',
    name: courseTitle,
    organizationName: 'LMS Platform',
    issueYear:  String(issueYear),
    issueMonth: String(issueMonth),
    certUrl:    verifyUrl,
    certId,
  });

  const href = `https://www.linkedin.com/profile/add?${params}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#0077b5] text-[#0077b5] text-sm font-medium hover:bg-[#0077b5] hover:text-white transition-colors"
    >
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
      </svg>
      Add to LinkedIn
    </a>
  );
}

export default function CertificatePage() {
  const { courseId } = useParams<{ courseId: string }>();
  const router = useRouter();
  const [generatingPdf, setGeneratingPdf] = useState(false);

  async function downloadPdf(certId: string) {
    const el = document.getElementById('certificate');
    if (!el) return;
    setGeneratingPdf(true);
    try {
      // @ts-ignore — types available after npm install
      const { default: html2canvas } = await import('html2canvas');
      // @ts-ignore
      const { default: jsPDF } = await import('jspdf');
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: null });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`certificate-${certId}.pdf`);
    } finally {
      setGeneratingPdf(false);
    }
  }

  const { data, isLoading, isError, error } = useQuery<CertificateData>({
    queryKey: ['certificate', courseId],
    queryFn: () =>
      api.get(`/courses/${courseId}/certificate`).then(r => r.data?.data),
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-24"><Spinner className="w-6 h-6 text-primary-500" /></div>;
  }

  if (isError || !data) {
    const errMsg = (error as any)?.response?.data?.message ?? 'Certificate not available. Please complete the course first.';
    return (
      <div className="p-6 max-w-xl mx-auto space-y-4">
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{errMsg}</div>
        <Button variant="outline" onClick={() => router.back()}>← Go Back</Button>
      </div>
    );
  }

  const t = data.template;
  const accent         = t?.accentColor       ?? '#0284c7';
  const bg             = t?.backgroundColor  ?? '#ffffff';
  const borderStyle    = t?.borderStyle      ?? 'classic';
  const fontFamily     = FONT_MAP[t?.fontFamily ?? 'serif'];
  const nameFontSize   = t?.nameFontSize     ?? 36;
  const titleFontSize  = t?.titleFontSize    ?? 22;
  const bgImage        = t?.backgroundImageUrl ?? null;

  const borderStyles: Record<string, React.CSSProperties> = {
    classic: { border: `3px solid ${accent}` },
    modern:  { border: `2px solid ${accent}`, borderRadius: '16px' },
    minimal: { borderTop: `6px solid ${accent}` },
    elegant: { border: `1px solid #d4af37`, outline: `4px solid ${accent}`, outlineOffset: '-10px' },
  };

  const signatoryName  = t?.signatoryName  || data.instructorName;
  const hasSecond = !!(t?.secondSignatoryName || t?.secondSignatoryTitle || t?.secondSignatureImageUrl);

  const verifyUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/verify/${data.certificateId}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(verifyUrl)}&color=000000&bgcolor=ffffff&margin=4`;

  return (
    <>
      {/* Print-specific styles — hides everything except #certificate */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #certificate, #certificate * { visibility: visible !important; }
          #certificate {
            position: fixed !important;
            inset: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            box-shadow: none !important;
            border-radius: 0 !important;
          }
        }
      `}</style>

      <div className="p-6 flex flex-col items-center">
        {/* Actions */}
        <div className="w-full max-w-3xl flex items-center justify-between mb-6 print:hidden">
          <Button variant="outline" onClick={() => router.back()}>← Back</Button>
          <div className="flex items-center gap-3 flex-wrap justify-end">
            <LinkedInShareButton
              courseTitle={data.courseTitle}
              issuedAt={data.issuedAt}
              certId={data.certificateId}
            />
            <a
              href={verifyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Verify
            </a>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print
            </button>
            <Button loading={generatingPdf} onClick={() => downloadPdf(data.certificateId)}>
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download PDF
            </Button>
          </div>
        </div>

        {/* Certificate */}
        <div
          id="certificate"
          className="w-full max-w-3xl shadow-lg print:shadow-none overflow-hidden"
          style={{
            ...borderStyles[borderStyle],
            fontFamily,
            backgroundColor: bg,
            minHeight: 480,
            ...(bgImage ? { backgroundImage: `url(${bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}),
          }}
        >
          {borderStyle !== 'minimal' && (
            <div style={{ height: 8, background: `linear-gradient(to right, ${accent}, ${accent}99, ${accent})` }} />
          )}

          <div className="px-16 py-12 flex flex-col items-center text-center">

            {(t?.logoUrl || t?.organizationName) && (
              <div className="flex items-center gap-3 mb-5">
                {t?.logoUrl && <img src={t.logoUrl} alt="Logo" className="h-10 object-contain" />}
                {t?.organizationName && <span className="text-sm font-semibold text-gray-700 tracking-wide">{t.organizationName}</span>}
              </div>
            )}

            {(t?.showBadge ?? true) && (
              <div className="w-16 h-16 rounded-full mb-5 flex items-center justify-center"
                style={{ background: `${accent}18`, border: `3px solid ${accent}33` }}>
                <svg className="w-8 h-8" fill="none" stroke={accent} strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                </svg>
              </div>
            )}

            <p className="text-xs font-bold tracking-widest text-gray-400 uppercase mb-2">
              {t?.heading ?? 'Certificate of Completion'}
            </p>

            <p className="text-sm text-gray-500 mb-4">{t?.subheading ?? 'This certifies that'}</p>

            <h1 className="font-bold text-gray-900 mb-4" style={{ fontFamily, fontSize: nameFontSize }}>
              {data.studentName}
            </h1>

            <p className="text-sm text-gray-500 mb-3">{t?.bodyText ?? 'has successfully completed the course'}</p>

            <h2 className="font-semibold mb-8 max-w-xl leading-snug" style={{ color: accent, fontSize: titleFontSize }}>
              {data.courseTitle}
            </h2>

            <div className="w-16 h-px bg-gray-200 mb-8" />

            {/* Footer row — date + signatories */}
            <div className="flex items-end justify-center gap-12 w-full flex-wrap">
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-800">{formatLongDate(data.completedAt)}</p>
                <div className="w-32 h-px bg-gray-300 mt-2 mb-1 mx-auto" />
                <p className="text-xs text-gray-400 uppercase tracking-wide">Date Completed</p>
              </div>

              <div className="text-center">
                {t?.signatureImageUrl ? (
                  <img src={t.signatureImageUrl} alt="Signature" className="h-8 object-contain mx-auto mb-1" />
                ) : (
                  <p className="text-sm font-semibold text-gray-800">{signatoryName}</p>
                )}
                <div className="w-32 h-px bg-gray-300 mt-2 mb-1 mx-auto" />
                <p className="text-xs text-gray-400 uppercase tracking-wide">{t?.signatoryTitle ?? 'Instructor'}</p>
              </div>

              {hasSecond && (
                <div className="text-center">
                  {t?.secondSignatureImageUrl ? (
                    <img src={t.secondSignatureImageUrl} alt="Second Signature" className="h-8 object-contain mx-auto mb-1" />
                  ) : (
                    <p className="text-sm font-semibold text-gray-800">{t?.secondSignatoryName}</p>
                  )}
                  <div className="w-32 h-px bg-gray-300 mt-2 mb-1 mx-auto" />
                  <p className="text-xs text-gray-400 uppercase tracking-wide">{t?.secondSignatoryTitle}</p>
                </div>
              )}
            </div>

            {t?.footerNote && (
              <p className="text-xs text-gray-400 mt-6 italic">{t.footerNote}</p>
            )}

            {data.expiresAt && (
              <p className="text-[10px] text-amber-600 font-medium mt-4 flex items-center gap-1">
                <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Valid until {formatLongDate(data.expiresAt)}
              </p>
            )}

            {/* Certificate ID + QR */}
            <div className="flex items-center justify-between w-full mt-8 pt-5 border-t border-gray-100">
              <div className="text-left">
                <p className="text-[9px] text-gray-400 uppercase tracking-widest font-semibold mb-1">Certificate ID</p>
                <p className="text-xs font-mono font-bold text-gray-700 tracking-wider">{data.certificateId}</p>
                <p className="text-[9px] text-gray-400 mt-1">
                  Verify at: <span className="text-gray-500">lms/verify/{data.certificateId}</span>
                </p>
              </div>
              <div className="flex flex-col items-center gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrUrl} alt="Verification QR Code" width={80} height={80} className="rounded-lg" />
                <p className="text-[8px] text-gray-400 uppercase tracking-widest">Scan to verify</p>
              </div>
            </div>
          </div>

          {borderStyle !== 'minimal' && (
            <div style={{ height: 5, background: `linear-gradient(to right, ${accent}, ${accent}88, ${accent})` }} />
          )}
        </div>

        {/* Below certificate */}
        <div className="w-full max-w-3xl flex items-center justify-between mt-4 print:hidden">
          <p className="text-xs text-gray-400">Issued on {formatLongDate(data.issuedAt)}</p>
          <button
            onClick={() => navigator.clipboard?.writeText(verifyUrl).then(() => alert('Verification link copied!'))}
            className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
            </svg>
            Copy verify link
          </button>
        </div>
      </div>
    </>
  );
}
