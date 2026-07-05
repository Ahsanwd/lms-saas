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
  blue:   { wash: 'from-blue-50/80',   accent: 'from-blue-500 to-blue-600',     icon: 'bg-blue-100 text-blue-600' },
  green:  { wash: 'from-green-50/80',  accent: 'from-green-500 to-green-600',   icon: 'bg-green-100 text-green-600' },
  purple: { wash: 'from-purple-50/80', accent: 'from-purple-500 to-purple-600', icon: 'bg-purple-100 text-purple-600' },
  orange: { wash: 'from-orange-50/80', accent: 'from-orange-500 to-orange-600', icon: 'bg-orange-100 text-orange-600' },
};

export function StatCard({ title, value, subtitle, icon, trend, color = 'blue', className }: StatCardProps) {
  const c = colors[color];
  return (
    <div className={cn('bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden', className)}>
      <div className={cn('h-1 bg-gradient-to-r', c.accent)} />
      <div className={cn('bg-gradient-to-br to-white p-6', c.wash)}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">{title}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1 tracking-tight">{value}</p>
            {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
            {trend && (
              <span className={cn(
                'inline-flex items-center gap-1 text-xs mt-2 font-semibold px-1.5 py-0.5 rounded-md',
                trend.value >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              )}>
                {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
              </span>
            )}
          </div>
          <div className={cn('p-3 rounded-xl', c.icon)}>{icon}</div>
        </div>
      </div>
    </div>
  );
}
