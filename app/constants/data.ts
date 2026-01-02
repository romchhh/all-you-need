import { Listing } from '@/types';

export const mockListings: Listing[] = [
  {
    id: 7,
    title: 'Диван старий, але в хорошому стані',
    price: 'Безкоштовно',
    image: 'https://placehold.co/600x600/f5f5f5/666666?text=Free+Sofa',
    seller: { name: 'Олена П.', avatar: '👩', phone: '+49 176 111 2222' },
    category: 'free',
    condition: 'good',
    tags: ['Безкоштовно'],
    description: 'Віддаю старий диван безкоштовно. Потрібен вивіз самостійно. Стан хороший, просто не підходить під новий інтер\'єр.',
    location: 'Київ, Шевченківський район',
    views: 89,
    posted: '4 години тому',
    isFree: true
  },
  {
    id: 8,
    title: 'Дитячі іграшки - віддаю безкоштовно',
    price: 'Безкоштовно',
    image: 'https://placehold.co/600x600/fff4e6/ff9900?text=Free+Toys',
    seller: { name: 'Марія К.', avatar: '👩', phone: '+49 176 333 4444' },
    category: 'free',
    subcategory: 'toys',
    condition: 'good',
    tags: ['Безкоштовно'],
    description: 'Віддаю дитячі іграшки безкоштовно. Діти виросли, іграшки в хорошому стані.',
    location: 'Київ, Оболонський район',
    views: 145,
    posted: '1 день тому',
    isFree: true
  },
  {
    id: 1,
    title: 'Apple AirPods Pro 2 з активним шумоподавленням',
    price: '1 399 ₴',
    image: 'https://placehold.co/600x600/e8f4ff/0066cc?text=AirPods+Pro+2',
    images: [
      'https://placehold.co/600x600/e8f4ff/0066cc?text=AirPods+1',
      'https://placehold.co/600x600/d4e4ff/0055bb?text=AirPods+2',
      'https://placehold.co/600x600/c0d4ff/0044aa?text=AirPods+3'
    ],
    seller: { name: 'Кирил С.', avatar: '👨', phone: '+49 176 123 4567' },
    category: 'electronics',
    condition: 'like_new',
    tags: ['Оригінал', 'Гарантія'],
    description: 'Бездротові навушники Apple AirPods Pro 2 другого покоління з активним шумоподавленням та просторовим звуком.\n\nОсновні переваги:\n• Активне шумоподавлення для повного занурення в музику\n• Прозорий режим для спілкування без зняття навушників\n• Просторовий звук з динамічним відстеженням голови\n• До 6 годин прослуховування з одного заряду\n\nКомплект силіконових накладок різних розмірів для ідеальної посадки.',
    location: 'Київ, Печерський район',
    views: 234,
    posted: '2 години тому'
  },
  {
    id: 2,
    title: 'Кросівки Adidas оригінальні чорні',
    price: '700 ₴',
    image: 'https://placehold.co/600x600/f0f0f0/333333?text=Adidas+Sneakers',
    images: [
      'https://placehold.co/600x600/f0f0f0/333333?text=Adidas+1',
      'https://placehold.co/600x600/e0e0e0/222222?text=Adidas+2'
    ],
    seller: { name: 'Марина Ж.', avatar: '👩', phone: '+49 176 987 6543' },
    category: 'fashion',
    condition: 'good',
    tags: ['Оригінал'],
    description: 'Оригінальні кросівки Adidas в ідеальному стані. Розмір 42, колір чорний. Носились дуже мало, практично нові.',
    location: 'Київ, Подільський район',
    views: 156,
    posted: '5 годин тому'
  },
  {
    id: 3,
    title: 'iPhone 13 Pro 256GB Pacific Blue',
    price: '18 500 ₴',
    image: 'https://placehold.co/600x600/d4e4ff/1e3a5f?text=iPhone+13+Pro',
    images: [
      'https://placehold.co/600x600/d4e4ff/1e3a5f?text=iPhone+1',
      'https://placehold.co/600x600/c4d4ff/1d3a5e?text=iPhone+2',
      'https://placehold.co/600x600/b4c4ff/1c3a5d?text=iPhone+3',
      'https://placehold.co/600x600/a4b4ff/1b3a5c?text=iPhone+4'
    ],
    seller: { name: 'Владислав Х.', avatar: '👨', phone: '+49 176 555 8888' },
    category: 'electronics',
    condition: 'like_new',
    tags: ['Оригінал', 'Гарантія', 'Чек'],
    description: 'iPhone 13 Pro 256GB в кольорі Pacific Blue. Стан відмінний, без подряпин. Батарея тримає 94%. В комплекті оригінальна коробка та зарядка.',
    location: 'Київ, Шевченківський район',
    views: 432,
    posted: '1 день тому'
  },
  {
    id: 4,
    title: 'MacBook Pro 14" M2 Pro 16/512GB',
    price: '45 000 ₴',
    image: 'https://placehold.co/600x600/2c2c2c/ffffff?text=MacBook+Pro',
    images: [
      'https://placehold.co/600x600/2c2c2c/ffffff?text=MacBook+1',
      'https://placehold.co/600x600/3c3c3c/ffffff?text=MacBook+2'
    ],
    seller: { name: 'Надія Д.', avatar: '👩', phone: '+49 176 222 3333' },
    category: 'electronics',
    condition: 'like_new',
    tags: ['Оригінал', 'Гарантія', 'Чек'],
    description: 'MacBook Pro 14" з чіпом M2 Pro, 16GB RAM, 512GB SSD. Куплений 6 місяців тому, є чек та гарантія. Стан ідеальний.',
    location: 'Київ, Оболонський район',
    views: 567,
    posted: '3 години тому'
  },
  {
    id: 5,
    title: 'Sony WH-1000XM5 бездротові навушники',
    price: '8 500 ₴',
    image: 'https://placehold.co/600x600/1a1a1a/ffffff?text=Sony+WH-1000XM5',
    images: [
      'https://placehold.co/600x600/1a1a1a/ffffff?text=Sony+1',
      'https://placehold.co/600x600/2a2a2a/ffffff?text=Sony+2'
    ],
    seller: { name: 'Олександр М.', avatar: '👨', phone: '+49 176 444 5555' },
    category: 'electronics',
    condition: 'new',
    tags: ['Оригінал', 'Нові'],
    description: 'Нові бездротові навушники Sony WH-1000XM5 з найкращим шумоподавленням на ринку. Не розпаковані, з гарантією.',
    location: 'Київ, Солом\'янський район',
    views: 189,
    posted: '1 годину тому'
  },
  {
    id: 6,
    title: 'Nike Air Max 270 білі',
    price: '2 200 ₴',
    image: 'https://placehold.co/600x600/ffffff/000000?text=Nike+Air+Max',
    images: [
      'https://placehold.co/600x600/ffffff/000000?text=Nike+1',
      'https://placehold.co/600x600/f5f5f5/000000?text=Nike+2'
    ],
    seller: { name: 'Дмитро К.', avatar: '👨', phone: '+49 176 777 8888' },
    category: 'fashion',
    condition: 'good',
    tags: ['Оригінал'],
    description: 'Кросівки Nike Air Max 270 білого кольору, розмір 43. Носилися кілька разів, стан відмінний.',
    location: 'Київ, Дарницький район',
    views: 98,
    posted: '6 годин тому'
  }
];

