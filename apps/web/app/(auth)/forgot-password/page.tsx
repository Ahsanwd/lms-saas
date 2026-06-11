'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api from '@/lib/api';
import { Button, Input, Alert } from '@/components/ui';

const schema = z.object({
  email: z.string().email('Invalid email address'),
});

type FormData = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    // Always succeed on client — backend never reveals if email exists
    await api.post('/auth/forgot-password', data).catch(() => {});
    setSent(true);
  };

  if (sent) {
    return (
      <div className="text-center py-4">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-green-100 rounded-full mb-4">
          <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Check your inbox</h2>
        <p className="text-sm text-gray-500 mb-6">
          If that email is registered, you&apos;ll receive a password reset link shortly.
        </p>
        <Link href="/login">
          <Button variant="outline" className="w-full">Back to login</Button>
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Reset your password</h2>
        <p className="text-sm text-gray-500 mt-1">Enter your email and we&apos;ll send you a link.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Email address"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          error={errors.email?.message}
          {...register('email')}
        />
        <Button type="submit" className="w-full" loading={isSubmitting}>
          Send reset link
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
