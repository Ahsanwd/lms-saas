'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api from '@/lib/api';
import { Button, Input, Alert, Spinner } from '@/components/ui';
import { AxiosError } from 'axios';

const schema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type FormData = z.infer<typeof schema>;

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') ?? '';
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setError('');
    try {
      await api.post('/auth/reset-password', { token, newPassword: data.password });
      setDone(true);
      setTimeout(() => router.push('/login'), 3000);
    } catch (err) {
      const e = err as AxiosError<{ message: string }>;
      setError(e.response?.data?.message ?? 'Reset failed. The link may have expired.');
    }
  };

  if (!token) {
    return <Alert variant="error">Invalid or missing reset token. Please request a new link.</Alert>;
  }

  if (done) {
    return (
      <div className="text-center py-4">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-green-100 rounded-full mb-4">
          <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Password reset!</h2>
        <p className="text-sm text-gray-500">Redirecting you to login…</p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Set new password</h2>
        <p className="text-sm text-gray-500 mt-1">Choose a strong password for your account.</p>
      </div>

      {error && <Alert variant="error" className="mb-4">{error}</Alert>}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          placeholder="Min. 8 characters"
          error={errors.password?.message}
          {...register('password')}
        />
        <Input
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          placeholder="Repeat new password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />
        <Button type="submit" className="w-full" loading={isSubmitting}>
          Reset password
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        <Link href="/login" className="font-medium text-primary-600 hover:text-primary-700">
          Back to login
        </Link>
      </p>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="text-center py-8"><Spinner size="lg" className="mx-auto" /></div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}
