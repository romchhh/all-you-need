import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  subtitle: string;
}

export const EmptyState = ({ icon: Icon, title, subtitle }: EmptyStateProps) => (
  <div className="flex flex-col items-center justify-center py-20 px-6">
    <div className="flex items-center justify-center mb-6">
      <Icon size={64} className="text-gray-400" strokeWidth={1.5} />
    </div>
    <h3 className="text-xl font-semibold text-gray-900 mb-2">{title}</h3>
    <p className="text-gray-500 text-center text-sm leading-relaxed">{subtitle}</p>
  </div>
);

