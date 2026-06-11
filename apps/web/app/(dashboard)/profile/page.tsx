'use client';

import { useState, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { Button, Alert } from '@/components/ui';
import { formatDate } from '@/lib/utils';

interface Session {
  sessionId: string;
  deviceInfo: { ip?: string; ua?: string };
  createdAt: string;
  expiresAt: string;
  isCurrent?: boolean;
}

function AvatarCard() {
  const { user, setUser } = useAuthStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState('');

  const handleFile = (f: File) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) {
      setError('Please select a JPEG, PNG, or WebP image');
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setError('Image must be under 5 MB');
      return;
    }
    setError('');
    setFile(f);
    const url = URL.createObjectURL(f);
    setPreviewUrl(url);
  };

  const cancelSelection = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setError('');
  };

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      form.append('avatar', file!);
      const { data } = await api.post('/users/me/avatar', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data.data as { avatar: string };
    },
    onSuccess: (data) => {
      setUser({ ...user!, avatar: data.avatar });
      cancelSelection();
    },
    onError: (err: AxiosError<{ message: string }>) => {
      setError(err.response?.data?.message ?? 'Upload failed');
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => api.delete('/users/me/avatar'),
    onSuccess: () => setUser({ ...user!, avatar: undefined }),
    onError: (err: AxiosError<{ message: string }>) => {
      setError(err.response?.data?.message ?? 'Failed to remove photo');
    },
  });

  const displayUrl = previewUrl ?? user?.avatar ?? null;
  const initials = `${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`.toUpperCase();

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-base font-semibold text-gray-900 mb-4">Profile photo</h2>
      {error && <Alert variant="error" className="mb-3">{error}</Alert>}
      <div className="flex items-center gap-6">
        <div className="relative flex-shrink-0">
          {displayUrl ? (
            <img src={displayUrl} alt="Profile" className="w-20 h-20 rounded-full object-cover border-2 border-gray-200" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-2xl border-2 border-gray-200">
              {initials || '?'}
            </div>
          )}
          <button
            onClick={() => fileRef.current?.click()}
            className="absolute bottom-0 right-0 w-7 h-7 bg-white border border-gray-300 rounded-full flex items-center justify-center hover:bg-gray-50 shadow-sm transition-colors"
          >
            <svg className="w-3.5 h-3.5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); e.target.value = ''; }}
        />
        <div className="space-y-2">
          <p className="text-sm text-gray-500">
            {file
              ? <span className="text-primary-600 font-medium">{file.name} · {(file.size / 1024).toFixed(0)} KB — ready to save</span>
              : 'JPEG, PNG or WebP · max 5 MB · resized to 256×256'
            }
          </p>
          <div className="flex items-center gap-2">
            {!file && (
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
                {user?.avatar ? 'Change photo' : 'Upload photo'}
              </Button>
            )}
            {file && (
              <>
                <Button size="sm" loading={uploadMutation.isPending} onClick={() => uploadMutation.mutate()}>
                  Save photo
                </Button>
                <button className="text-sm text-gray-400 hover:text-gray-600 transition-colors" onClick={cancelSelection}>
                  Cancel
                </button>
              </>
            )}
            {!file && user?.avatar && (
              <Button size="sm" variant="danger" loading={removeMutation.isPending} onClick={() => removeMutation.mutate()}>
                Remove
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileCard() {
  const { user, setUser } = useAuthStore();
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => api.patch('/users/me', { firstName: firstName.trim(), lastName: lastName.trim() }),
    onSuccess: (res) => {
      setUser(res.data.data.user);
      setSuccess('Profile updated');
      setError('');
      setTimeout(() => setSuccess(''), 3000);
    },
    onError: (err: AxiosError<{ message: string }>) => {
      setError(err.response?.data?.message ?? 'Failed to update profile');
    },
  });

  const isDirty = firstName !== user?.firstName || lastName !== user?.lastName;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-base font-semibold text-gray-900 mb-4">Personal information</h2>
      {success && <Alert variant="success" className="mb-3">{success}</Alert>}
      {error && <Alert variant="error" className="mb-3">{error}</Alert>}
      <div className="space-y-4 max-w-md">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            value={user?.email ?? ''}
            disabled
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
          />
          <p className="text-xs text-gray-400 mt-1">Email cannot be changed.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">First name</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Last name</label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
          <input
            type="text"
            value={user?.role?.replace('_', ' ') ?? ''}
            disabled
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed capitalize"
          />
        </div>
        <Button
          loading={mutation.isPending}
          disabled={!isDirty || !firstName.trim() || !lastName.trim()}
          onClick={() => mutation.mutate()}
        >
          Save changes
        </Button>
      </div>
    </div>
  );
}

function PasswordCard() {
  const { logout } = useAuthStore();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => api.patch('/users/me/password', { currentPassword: current, newPassword: next }),
    onSuccess: async () => {
      setSuccess('Password changed. Signing you out…');
      setTimeout(() => logout(), 1500);
    },
    onError: (err: AxiosError<{ message: string }>) => {
      setError(err.response?.data?.message ?? 'Failed to change password');
    },
  });

  const mismatch = confirm && next !== confirm;
  const canSubmit = current && next.length >= 8 && next === confirm;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-base font-semibold text-gray-900 mb-1">Change password</h2>
      <p className="text-sm text-gray-500 mb-4">You will be signed out after a successful change.</p>
      {success && <Alert variant="success" className="mb-3">{success}</Alert>}
      {error && <Alert variant="error" className="mb-3">{error}</Alert>}
      <div className="space-y-4 max-w-md">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Current password</label>
          <input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <p className="text-xs text-gray-400 mt-1">Min 8 chars, uppercase, lowercase, number.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Confirm new password</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${
              mismatch ? 'border-red-400' : 'border-gray-300'
            }`}
          />
          {mismatch && <p className="text-xs text-red-500 mt-1">Passwords do not match.</p>}
        </div>
        <Button loading={mutation.isPending} disabled={!canSubmit} onClick={() => mutation.mutate()}>
          Change password
        </Button>
      </div>
    </div>
  );
}

function SessionsCard() {
  const qc = useQueryClient();

  const { data: sessions = [], isLoading } = useQuery<Session[]>({
    queryKey: ['my-sessions'],
    queryFn: async () => {
      const { data } = await api.get('/users/me/sessions');
      return data.data.sessions;
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (sessionId: string) => api.delete(`/users/me/sessions/${sessionId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-sessions'] }),
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-base font-semibold text-gray-900 mb-1">Active sessions</h2>
      <p className="text-sm text-gray-500 mb-4">Revoke any session you don't recognise.</p>
      {isLoading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-gray-400">No active sessions found.</p>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <div key={s.sessionId} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-gray-100 bg-gray-50">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">
                  {s.deviceInfo?.ua ? s.deviceInfo.ua.slice(0, 60) : 'Unknown device'}
                  {s.isCurrent && <span className="ml-2 text-xs text-primary-600 font-semibold">(this session)</span>}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  IP: {s.deviceInfo?.ip ?? '—'} · Started {formatDate(s.createdAt)}
                </p>
              </div>
              {!s.isCurrent && (
                <Button
                  size="sm"
                  variant="danger"
                  loading={revokeMutation.isPending}
                  onClick={() => revokeMutation.mutate(s.sessionId)}
                >
                  Revoke
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProfilePage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Profile settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage your account details and security.</p>
      </div>
      <AvatarCard />
      <ProfileCard />
      <PasswordCard />
      <SessionsCard />
    </div>
  );
}
