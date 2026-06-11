import { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type AlertVariant = 'info' | 'success' | 'warning' | 'error';

interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
  title?: string;
}

const styles: Record<AlertVariant, string> = {
  info:    'bg-blue-50 border-blue-200 text-blue-800',
  success: 'bg-green-50 border-green-200 text-green-800',
  warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  error:   'bg-red-50 border-red-200 text-red-800',
};

export function Alert({ variant = 'info', title, children, className, ...props }: AlertProps) {
  return (
    <div className={cn('rounded-lg border px-4 py-3 text-sm', styles[variant], className)} {...props}>
      {title && <p className="font-semibold mb-0.5">{title}</p>}
      <div>{children}</div>
    </div>
  );
}
