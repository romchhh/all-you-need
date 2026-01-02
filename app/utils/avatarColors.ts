/**
 * Генерує колір для аватара на основі імені
 * Використовує хеш функцію для забезпечення консистентності
 */
export const getAvatarColor = (name: string): string => {
  const colors = [
    'from-blue-400 to-blue-600',
    'from-purple-400 to-purple-600',
    'from-pink-400 to-pink-600',
    'from-red-400 to-red-600',
    'from-orange-400 to-orange-600',
    'from-yellow-400 to-yellow-600',
    'from-green-400 to-green-600',
    'from-teal-400 to-teal-600',
    'from-cyan-400 to-cyan-600',
    'from-indigo-400 to-indigo-600',
    'from-violet-400 to-violet-600',
    'from-fuchsia-400 to-fuchsia-600',
  ];

  // Простий хеш для консистентності
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const index = Math.abs(hash) % colors.length;
  return colors[index];
};

