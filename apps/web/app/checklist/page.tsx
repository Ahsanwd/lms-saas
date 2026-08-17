import type { Metadata } from 'next';
import { ChecklistOptIn } from '@/components/marketing/ChecklistOptIn';

export const metadata: Metadata = {
  title: 'Sell Online Courses from Pakistan Without Stripe — Free Checklist | Coursel',
  description: 'A free 24-item checklist for Pakistani course creators to launch and get paid without needing Stripe.',
};

export default function ChecklistPage() {
  return <ChecklistOptIn />;
}
