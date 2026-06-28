'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api, { setAccessToken, setTenantSubdomain } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { Button, Input, Alert } from '@/components/ui';
import { AxiosError } from 'axios';

const schema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  tenantName: z.string().min(2, 'Organization name is required'),
  subdomain: z
    .string()
    .min(3, 'Subdomain must be at least 3 characters')
    .regex(/^[a-z0-9-]+$/, 'Subdomain can only contain lowercase letters, numbers and hyphens'),
});

type FormData = z.infer<typeof schema>;

export default function RegisterPage() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const [error, setError] = useState('');

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setError('');
    try {
      const { data: res } = await api.post('/auth/register-tenant', data);
      setAccessToken(res.data.accessToken);
      setTenantSubdomain(res.data.tenant.subdomain);
      setUser(res.data.user);
      if (res.data.user.status === 'unverified') {
        router.push('/verify-email?fromRegister=1');
      } else {
        router.push('/dashboard');
      }
    } catch (err) {
      const e = err as AxiosError<{ message: string }>;
      setError(e.response?.data?.message ?? 'Registration failed. Please try again.');
    }
  };

  return (
    <>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Create your account</h2>
        <p className="text-sm text-gray-500 mt-1">Start your 14-day free trial</p>
      </div>

      {error && <Alert variant="error" className="mb-4">{error}</Alert>}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="First name"
            autoComplete="given-name"
            placeholder="John"
            error={errors.firstName?.message}
            {...register('firstName')}
          />
          <Input
            label="Last name"
            autoComplete="family-name"
            placeholder="Doe"
            error={errors.lastName?.message}
            {...register('lastName')}
          />
        </div>
        <Input
          label="Work email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          error={errors.email?.message}
          {...register('email')}
        />
        <Input
          label="Password"
          type="password"
          autoComplete="new-password"
          placeholder="Min. 8 characters"
          error={errors.password?.message}
          {...register('password')}
        />
        <Input
          label="Organization name"
          placeholder="Acme Corp"
          error={errors.tenantName?.message}
          {...register('tenantName')}
        />
        <Input
          label="Subdomain"
          placeholder="acme"
          hint="Your platform will be at: acme.coursel.space"
          error={errors.subdomain?.message}
          {...register('subdomain')}
        />

        <Button type="submit" className="w-full" loading={isSubmitting}>
          Create account
        </Button>

        <p className="text-xs text-center text-gray-500">
          By creating an account, you agree to our{' '}
          <span className="text-primary-600 cursor-pointer">Terms of Service</span> and{' '}
          <span className="text-primary-600 cursor-pointer">Privacy Policy</span>.
        </p>
      </form>

      <p className="mt-4 text-center text-sm text-gray-500">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-primary-600 hover:text-primary-700">
          Sign in
        </Link>
      </p>
    </>
  );
}
