'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AxiosError } from 'axios';
import api, { setTenantSubdomain } from '@/lib/api';
import { Button, Input, Alert, Spinner } from '@/components/ui';

const schema = z
  .object({
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    password: z
      .string()
      .min(8, 'Min. 8 characters')
      .regex(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Must contain uppercase, lowercase and a number'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type FormData = z.infer<typeof schema>;

function AcceptInviteContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') ?? '';
  const tenant = searchParams.get('tenant') ?? '';

  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // Set tenant cookie so api interceptor sends X-Tenant-Subdomain on every request
  useEffect(() => {
    if (tenant) setTenantSubdomain(tenant);
  }, [tenant]);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setError('');
    try {
      await api.post('/users/invite/accept', {
        token,
        firstName: data.firstName,
        lastName: data.lastName,
        password: data.password,
      });
      setSuccess(true);
    } catch (err) {
      const e = err as AxiosError<{ message: string }>;
      setError(e.response?.data?.message ?? 'Could not accept invitation. The link may have expired.');
    }
  };

  if (!token) {
    return (
      <>
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Invalid Invite Link</h2>
        </div>
        <Alert variant="error">
          No invite token found. Please use the link from your invitation email.
        </Alert>
      </>
    );
  }

  if (success) {
    return (
      <>
        <div className="mb-6 text-center">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900">Account Created!</h2>
          <p className="text-sm text-gray-500 mt-1">Your account is ready. Sign in to get started.</p>
        </div>
        <Button
          className="w-full"
          onClick={() => router.push(tenant ? `/login?tenant=${tenant}` : '/login')}
        >
          Go to Login
        </Button>
      </>
    );
  }

  return (
    <>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Accept invitation</h2>
        <p className="text-sm text-gray-500 mt-1">Create your account to get started.</p>
      </div>

      {error && <Alert variant="error" className="mb-4">{error}</Alert>}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">First name</label>
            <Input
              {...register('firstName')}
              placeholder="Jane"
              autoComplete="given-name"
              autoFocus
            />
            {errors.firstName && (
              <p className="text-xs text-red-600 mt-1">{errors.firstName.message}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Last name</label>
            <Input
              {...register('lastName')}
              placeholder="Doe"
              autoComplete="family-name"
            />
            {errors.lastName && (
              <p className="text-xs text-red-600 mt-1">{errors.lastName.message}</p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <Input
            type="password"
            {...register('password')}
            placeholder="Min. 8 characters"
            autoComplete="new-password"
          />
          {errors.password && (
            <p className="text-xs text-red-600 mt-1">{errors.password.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
          <Input
            type="password"
            {...register('confirmPassword')}
            placeholder="Repeat password"
            autoComplete="new-password"
          />
          {errors.confirmPassword && (
            <p className="text-xs text-red-600 mt-1">{errors.confirmPassword.message}</p>
          )}
        </div>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Creating account…' : 'Accept & create account'}
        </Button>
      </form>
    </>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<div className="text-center py-8"><Spinner size="lg" className="mx-auto" /></div>}>
      <AcceptInviteContent />
    </Suspense>
  );
}
