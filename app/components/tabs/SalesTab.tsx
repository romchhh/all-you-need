import { TrendingUp } from 'lucide-react';
import { EmptyState } from '../EmptyState';

export const SalesTab = () => (
  <EmptyState 
    icon={TrendingUp}
    title="У вас ще немає продажів"
    subtitle="Створіть оголошення, щоб почати продавати"
  />
);

