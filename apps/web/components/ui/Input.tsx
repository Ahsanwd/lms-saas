import { forwardRef, InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, leftIcon, rightIcon, id, ...props }, ref) => {
    const inputId  = id ?? label?.toLowerCase().replace(/\s+/g, '-');
    const errorId  = error  ? `${inputId}-error`  : undefined;
    const hintId   = hint   ? `${inputId}-hint`   : undefined;
    const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 mb-1">
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={cn(
              'block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400',
              'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent',
              'disabled:bg-gray-50 disabled:cursor-not-allowed',
              error && 'border-red-500 focus:ring-red-500',
              leftIcon && 'pl-10',
              rightIcon && 'pr-10',
              className
            )}
            {...props}
          />
          {rightIcon && (
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400">
              {rightIcon}
            </div>
          )}
        </div>
        {error && <p id={errorId} className="mt-1 text-xs text-red-600" role="alert">{error}</p>}
        {hint && !error && <p id={hintId} className="mt-1 text-xs text-gray-500">{hint}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
export { Input };
