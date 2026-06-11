import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: { value: number; label: string };
  color?: 'blue' | 'green' | 'purple' | 'orange';
  className?: string;
}

const colors = {
  blue:   { bg: 'bg-blue-50',   icon: 'bg-blue-100 text-blue-600' },
  green:  { bg: 'bg-green-50',  icon: 'bg-green-100 text-green-600' },
  purple: { bg: 'bg-purple-50', icon: 'bg-purple-100 text-purple-600' },
  orange: { bg: 'bg-orange-50', icon: 'bg-orange-100 text-orange-600' },
};

export function StatCard({ title, value, subtitle, icon, trend, color = 'blue', className }: StatCardProps) {
  const c = colors[color];
  return (
    <div className={cn('bg-white rounded-xl border border-gray-200 shadow-sm p-6', className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
          {trend && (
            <p className={cn('text-xs mt-2 font-medium', trend.value >= 0 ? 'text-green-600' : 'text-red-600')}>
              {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
            </p>
          )}
        </div>
        <div className={cn('p-3 rounded-lg', c.icon)}>{icon}</div>
      </div>
    </div>
  );
}
