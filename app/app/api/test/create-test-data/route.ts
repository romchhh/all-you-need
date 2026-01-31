import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

type UserRow = { id: number; firstName: string | null; lastName: string | null; avatar: string | null };

const TEST_USERS = [
  { telegramId: 888888001, firstName: 'Anna', lastName: 'Müller', username: 'anna_mwenenwnenw' },
  { telegramId: 888888002, firstName: 'Max', lastName: 'Schmidt', username: 'max_ssssswe' },
  { telegramId: 888888003, firstName: 'Julia', lastName: 'Weber', username: 'julia_wwwweeebber' },
];

const GERMAN_CITIES = [
  'Berlin', 'München', 'Hamburg', 'Köln', 'Frankfurt', 'Stuttgart', 'Düsseldorf',
  'Dortmund', 'Essen', 'Leipzig', 'Bremen', 'Dresden', 'Hannover', 'Nürnberg', 'Wiesbaden',
];

// 10 категорій × 10 оголошень = 100. Підкатегорії та фото під категорію.
const CATEGORIES_CONFIG: Array<{
  category: string;
  subcategory: string;
  images: string[];
  items: Array<{ titleUk: string; titleRu: string; descUk: string; descRu: string; price: string }>;
}> = [
  {
    category: 'fashion',
    subcategory: 'women_clothing',
    images: [
      'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=800',
      'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=800',
      'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=800',
    ],
    items: [
      { titleUk: 'Куртка зимова жіноча', titleRu: 'Куртка зимняя женская', descUk: 'Відмінний стан.', descRu: 'Отличное состояние.', price: '85' },
      { titleUk: 'Плаття вечірнє', titleRu: 'Платье вечернее', descUk: 'Розмір 42.', descRu: 'Размер 42.', price: '120' },
      { titleUk: 'Светр в\'язений', titleRu: 'Свитер вязаный', descUk: 'Новий з биркою.', descRu: 'Новый с биркой.', price: '45' },
      { titleUk: 'Штани джинсові', titleRu: 'Джинсы', descUk: 'Сині, розмір 40.', descRu: 'Синие, размер 40.', price: '55' },
      { titleUk: 'Пальто осіннє', titleRu: 'Пальто осеннее', descUk: 'Колір бежевий.', descRu: 'Цвет бежевый.', price: '95' },
      { titleUk: 'Блузка шовкова', titleRu: 'Блузка шелковая', descUk: 'Не носилась.', descRu: 'Не носилась.', price: '38' },
      { titleUk: 'Спідниця офісна', titleRu: 'Юбка офисная', descUk: 'Чорна, класика.', descRu: 'Черная, классика.', price: '42' },
      { titleUk: 'Жакет двобортний', titleRu: 'Жакет двубортный', descUk: 'Стан як новий.', descRu: 'Состояние как новое.', price: '78' },
      { titleUk: 'Худі з капюшоном', titleRu: 'Худи с капюшоном', descUk: 'Розмір M.', descRu: 'Размер M.', price: '35' },
      { titleUk: 'Тренч бежевий', titleRu: 'Тренч бежевый', descUk: 'Водовідштовхувальний.', descRu: 'Водоотталкивающий.', price: '110' },
    ],
  },
  {
    category: 'furniture',
    subcategory: 'sofas_chairs',
    images: [
      'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800',
      'https://images.unsplash.com/photo-1540574163026-643ea20ade25?w=800',
      'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800',
    ],
    items: [
      { titleUk: 'Диван угловий', titleRu: 'Диван угловой', descUk: 'М\'який, сірий.', descRu: 'Мягкий, серый.', price: '450' },
      { titleUk: 'Крісло крісло-ліжжо', titleRu: 'Кресло кресло-кровать', descUk: 'Розкладається.', descRu: 'Раскладывается.', price: '180' },
      { titleUk: 'Диван двомісний', titleRu: 'Диван двухместный', descUk: 'Самовивіз.', descRu: 'Самовывоз.', price: '220' },
      { titleUk: 'Пуф круглий', titleRu: 'Пуф круглый', descUk: 'Тканинна оббивка.', descRu: 'Тканевая обивка.', price: '65' },
      { titleUk: 'Кутовий модуль', titleRu: 'Угловой модуль', descUk: 'Склад з підлокітниками.', descRu: 'Склад с подлокотниками.', price: '320' },
      { titleUk: 'Ліжко односпальне', titleRu: 'Кровать односпальная', descUk: 'З матрасом.', descRu: 'С матрасом.', price: '280' },
      { titleUk: 'Стілець офісний', titleRu: 'Стул офисный', descUk: 'Регулювання висоти.', descRu: 'Регулировка высоты.', price: '75' },
      { titleUk: 'Шафа-купе', titleRu: 'Шкаф-купе', descUk: 'Двобічний.', descRu: 'Двусторонний.', price: '380' },
      { titleUk: 'Комод три ящики', titleRu: 'Комод три ящика', descUk: 'Дерево.', descRu: 'Дерево.', price: '150' },
      { titleUk: 'Полиця книжкова', titleRu: 'Полка книжная', descUk: 'Метал і дерево.', descRu: 'Металл и дерево.', price: '90' },
    ],
  },
  {
    category: 'electronics',
    subcategory: 'smartphones',
    images: [
      'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800',
      'https://images.unsplash.com/photo-1592286927505-d3d0c2e3a9e5?w=800',
      'https://images.unsplash.com/photo-1510557880182-3d0d3dc32f26?w=800',
    ],
    items: [
      { titleUk: 'Смартфон Samsung Galaxy', titleRu: 'Смартфон Samsung Galaxy', descUk: 'Повна комплектація.', descRu: 'Полная комплектация.', price: '320' },
      { titleUk: 'iPhone 12', titleRu: 'iPhone 12', descUk: '128 ГБ, батарея ок.', descRu: '128 ГБ, батарея ок.', price: '380' },
      { titleUk: 'Ноутбук MacBook Air M1', titleRu: 'Ноутбук MacBook Air M1', descUk: '256 ГБ.', descRu: '256 ГБ.', price: '720' },
      { titleUk: 'Навушники бездротові', titleRu: 'Наушники беспроводные', descUk: 'Шумозаглушення.', descRu: 'Шумоподавление.', price: '95' },
      { titleUk: 'Планшет iPad', titleRu: 'Планшет iPad', descUk: '10 дюймів.', descRu: '10 дюймов.', price: '280' },
      { titleUk: 'Монітор 27"', titleRu: 'Монитор 27"', descUk: 'IPS, 75 Hz.', descRu: 'IPS, 75 Гц.', price: '165' },
      { titleUk: 'Клавіатура механічна', titleRu: 'Клавиатура механическая', descUk: 'Підсвітка RGB.', descRu: 'Подсветка RGB.', price: '78' },
      { titleUk: 'Миша бездротова', titleRu: 'Мышь беспроводная', descUk: 'Логітех.', descRu: 'Логитеч.', price: '42' },
      { titleUk: 'Колонка портативна', titleRu: 'Колонка портативная', descUk: 'JBL, водозахист.', descRu: 'JBL, водозащита.', price: '88' },
      { titleUk: 'Роутер Wi-Fi 6', titleRu: 'Роутер Wi-Fi 6', descUk: 'Двохдіапазонний.', descRu: 'Двухдиапазонный.', price: '95' },
    ],
  },
  {
    category: 'appliances',
    subcategory: 'large_appliances',
    images: [
      'https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?w=800',
      'https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?w=800',
      'https://images.unsplash.com/photo-1585659722983-3a675dabf23d?w=800',
    ],
    items: [
      { titleUk: 'Холодильник Samsung', titleRu: 'Холодильник Samsung', descUk: 'No Frost, двокамерний.', descRu: 'No Frost, двухкамерный.', price: '380' },
      { titleUk: 'Пральна машина', titleRu: 'Стиральная машина', descUk: 'Завантаження 6 кг.', descRu: 'Загрузка 6 кг.', price: '290' },
      { titleUk: 'Посудомийна машина', titleRu: 'Посудомоечная машина', descUk: 'Вбудована.', descRu: 'Встраиваемая.', price: '320' },
      { titleUk: 'Мікрохвильова піч', titleRu: 'Микроволновка', descUk: '20 л, гриль.', descRu: '20 л, гриль.', price: '75' },
      { titleUk: 'Пилосос безмішевий', titleRu: 'Пылесос бесмешковый', descUk: 'Dyson-тип.', descRu: 'Тип Dyson.', price: '120' },
      { titleUk: 'Кондиціонер', titleRu: 'Кондиционер', descUk: 'Інверторний.', descRu: 'Инверторный.', price: '420' },
      { titleUk: 'Праска з паром', titleRu: 'Утюг с паром', descUk: 'Вертикальний відпарювач.', descRu: 'Вертикальный отпариватель.', price: '55' },
      { titleUk: 'Блендер погружний', titleRu: 'Блендер погружной', descUk: 'Метал. ножі.', descRu: 'Метал. ножи.', price: '48' },
      { titleUk: 'Тостер двослотний', titleRu: 'Тостер двухслотовый', descUk: 'Регулювання ступеня.', descRu: 'Регулировка степени.', price: '35' },
      { titleUk: 'Чайник електричний', titleRu: 'Чайник электрический', descUk: '1.7 л, підсвітка.', descRu: '1.7 л, подсветка.', price: '42' },
    ],
  },
  {
    category: 'kids',
    subcategory: 'strollers_car_seats',
    images: [
      'https://images.unsplash.com/photo-1587654780291-39c9404d746b?w=800',
      'https://images.unsplash.com/photo-1519689680058-324335c77eba?w=800',
      'https://images.unsplash.com/photo-1587616211892-f7f3ec9ab6b2?w=800',
    ],
    items: [
      { titleUk: 'Дитяча коляска 3 в 1', titleRu: 'Детская коляска 3 в 1', descUk: 'Відмінний стан.', descRu: 'Отличное состояние.', price: '280' },
      { titleUk: 'Автокрісло 0+', titleRu: 'Автокресло 0+', descUk: 'До 13 кг.', descRu: 'До 13 кг.', price: '95' },
      { titleUk: 'Санки дитячі', titleRu: 'Санки детские', descUk: 'З спинкою.', descRu: 'Со спинкой.', price: '45' },
      { titleUk: 'Стільчик для годування', titleRu: 'Стульчик для кормления', descUk: 'Регулюється.', descRu: 'Регулируется.', price: '78' },
      { titleUk: 'Манеж складний', titleRu: 'Манеж складной', descUk: 'С сіткою.', descRu: 'С сеткой.', price: '65' },
      { titleUk: 'Ходунки', titleRu: 'Ходунки', descUk: 'Музика, іграшки.', descRu: 'Музыка, игрушки.', price: '38' },
      { titleUk: 'Велосипед з ручкою', titleRu: 'Велосипед с ручкой', descUk: 'Від 1 року.', descRu: 'От 1 года.', price: '88' },
      { titleUk: 'Ковдра дитяча', titleRu: 'Одеяло детское', descUk: 'На виростання.', descRu: 'На вырост.', price: '32' },
      { titleUk: 'Комплект постільний', titleRu: 'Комплект постельный', descUk: 'Для ліжечка 120.', descRu: 'Для кроватки 120.', price: '42' },
      { titleUk: 'Стульчик-трансформер', titleRu: 'Стульчик-трансформер', descUk: 'До стільця.', descRu: 'До стула.', price: '72' },
    ],
  },
  {
    category: 'home',
    subcategory: 'dishes',
    images: [
      'https://images.unsplash.com/photo-1556911220-bff31c812dba?w=800',
      'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800',
      'https://images.unsplash.com/photo-1584990347449-3a4c2a1c8b?w=800',
    ],
    items: [
      { titleUk: 'Набір посуду 24 пр.', titleRu: 'Набор посуды 24 пр.', descUk: 'Нержавійка.', descRu: 'Нержавейка.', price: '85' },
      { titleUk: 'Сковорода антипригарна', titleRu: 'Сковорода антипригарная', descUk: '28 см.', descRu: '28 см.', price: '35' },
      { titleUk: 'Каструлі 3 шт.', titleRu: 'Кастрюли 3 шт.', descUk: 'Скло кришка.', descRu: 'Стекло крышка.', price: '68' },
      { titleUk: 'Чайний сервіз', titleRu: 'Чайный сервиз', descUk: '6 персон.', descRu: '6 персон.', price: '55' },
      { titleUk: 'Текстиль кухонний', titleRu: 'Текстиль кухонный', descUk: 'Рушники, прихватки.', descRu: 'Полотенца, прихватки.', price: '22' },
      { titleUk: 'Лампа настільна', titleRu: 'Лампа настольная', descUk: 'LED, диммер.', descRu: 'LED, диммер.', price: '42' },
      { titleUk: 'Ваза керамічна', titleRu: 'Ваза керамическая', descUk: 'Висока.', descRu: 'Высокая.', price: '28' },
      { titleUk: 'Декор для вікна', titleRu: 'Декор для окна', descUk: 'Штори, жалюзі.', descRu: 'Шторы, жалюзи.', price: '45' },
      { titleUk: 'Інструменти ручні', titleRu: 'Инструменты ручные', descUk: 'Набір 12 пр.', descRu: 'Набор 12 пр.', price: '38' },
      { titleUk: 'Органайзер для шухляд', titleRu: 'Органайзер для ящиков', descUk: 'Пластик.', descRu: 'Пластик.', price: '18' },
    ],
  },
  {
    category: 'auto',
    subcategory: 'accessories',
    images: [
      'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800',
      'https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800',
      'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=800',
    ],
    items: [
      { titleUk: 'Авточехли', titleRu: 'Авточехлы', descUk: 'Універсальні.', descRu: 'Универсальные.', price: '55' },
      { titleUk: 'Килимки автомобільні', titleRu: 'Коврики автомобильные', descUk: 'Комплект 4 шт.', descRu: 'Комплект 4 шт.', price: '42' },
      { titleUk: 'Держатель для телефону', titleRu: 'Держатель для телефона', descUk: 'На решітку.', descRu: 'На решетку.', price: '15' },
      { titleUk: 'Компресор авто', titleRu: 'Компрессор авто', descUk: '12V.', descRu: '12V.', price: '35' },
      { titleUk: 'Аптечка авто', titleRu: 'Аптечка авто', descUk: 'Повний набір.', descRu: 'Полный набор.', price: '22' },
      { titleUk: 'Склоомивач зимовий', titleRu: 'Омыватель зимний', descUk: '-30 °C.', descRu: '-30 °C.', price: '8' },
      { titleUk: 'Щітки склоочисника', titleRu: 'Щетки стеклоочистителя', descUk: 'Парні.', descRu: 'Парные.', price: '18' },
      { titleUk: 'Фаркоп демонтуєм.', titleRu: 'Фаркоп демонтируемый', descUk: 'Під балон.', descRu: 'Под баллон.', price: '120' },
      { titleUk: 'Багажник на дах', titleRu: 'Багажник на крышу', descUk: 'Універсальні лапи.', descRu: 'Универсальные лапы.', price: '95' },
      { titleUk: 'Сигналізація з автозапуском', titleRu: 'Сигнализация с автозапуском', descUk: 'Двостороння.', descRu: 'Двусторонняя.', price: '85' },
    ],
  },
  {
    category: 'hobby_sports',
    subcategory: 'bikes_scooters',
    images: [
      'https://images.unsplash.com/photo-1485965120184-e220f721d03e?w=800',
      'https://images.unsplash.com/photo-1532298229144-0ec0c57515c7?w=800',
      'https://images.unsplash.com/photo-1576435728678-68d0fbf94e91?w=800',
    ],
    items: [
      { titleUk: 'Велосипед горний', titleRu: 'Велосипед горный', descUk: 'Розмір рами 18.', descRu: 'Размер рамы 18.', price: '280' },
      { titleUk: 'Самокат дорослий', titleRu: 'Самокат взрослый', descUk: 'Електро.', descRu: 'Электро.', price: '320' },
      { titleUk: 'Гітара акустична', titleRu: 'Гитара акустическая', descUk: 'Yamaha, чохол.', descRu: 'Yamaha, чехол.', price: '145' },
      { titleUk: 'М\'яч футбольний', titleRu: 'Мяч футбольный', descUk: 'Розмір 5.', descRu: 'Размер 5.', price: '28' },
      { titleUk: 'Тенісна ракетка', titleRu: 'Теннисная ракетка', descUk: 'Парна.', descRu: 'Парная.', price: '55' },
      { titleUk: 'Тренажер бігова доріжка', titleRu: 'Тренажер беговая дорожка', descUk: 'Складна.', descRu: 'Складная.', price: '380' },
      { titleUk: 'Гантелі 2×5 кг', titleRu: 'Гантели 2×5 кг', descUk: 'Неопрен.', descRu: 'Неопрен.', price: '42' },
      { titleUk: 'Рюкзак туристичний', titleRu: 'Рюкзак туристический', descUk: '40 л.', descRu: '40 л.', price: '65' },
      { titleUk: 'Палатка двосхила', titleRu: 'Палатка двускатная', descUk: '2 особи.', descRu: '2 человека.', price: '88' },
      { titleUk: 'Спортивний годинник', titleRu: 'Спортивные часы', descUk: 'GPS, пульс.', descRu: 'GPS, пульс.', price: '95' },
    ],
  },
  {
    category: 'realestate',
    subcategory: 'rent_apartments',
    images: [
      'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800',
      'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800',
      'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800',
    ],
    items: [
      { titleUk: 'Оренда 2-к. квартири', titleRu: 'Аренда 2-к. квартиры', descUk: 'Довгостроково.', descRu: 'Долгосрочно.', price: '1200' },
      { titleUk: 'Кімната в квартирі', titleRu: 'Комната в квартире', descUk: 'Мебльована.', descRu: 'Меблированная.', price: '480' },
      { titleUk: 'Продаж 1-к. квартира', titleRu: 'Продажа 1-к. квартира', descUk: 'Ремонт.', descRu: 'Ремонт.', price: '95000' },
      { titleUk: 'Будинок під оренду', titleRu: 'Дом под аренду', descUk: 'Садиба.', descRu: 'Усадьба.', price: '1800' },
      { titleUk: 'Офіс 45 м²', titleRu: 'Офис 45 м²', descRu: 'Центр.', descUk: 'Центр.', price: '850' },
      { titleUk: 'Гараж бокс', titleRu: 'Гараж бокс', descUk: 'Підземний паркинг.', descRu: 'Подземный паркинг.', price: '120' },
      { titleUk: 'Студія на добу', titleRu: 'Студия на сутки', descUk: 'Посутково.', descRu: 'Посуточно.', price: '65' },
      { titleUk: 'Квартира 3 к. з ремонтом', titleRu: 'Квартира 3 к. с ремонтом', descUk: 'Євро.', descRu: 'Евро.', price: '185000' },
      { titleUk: 'Комерційна нерухомість', titleRu: 'Коммерческая недвижимость', descUk: 'Приміщення під магазин.', descRu: 'Помещение под магазин.', price: '2200' },
      { titleUk: 'Паркомісце', titleRu: 'Паркоместо', descUk: 'Крытий паркинг.', descRu: 'Крытый паркинг.', price: '45' },
    ],
  },
  {
    category: 'services_work',
    subcategory: 'services',
    images: [
      'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=800',
      'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=800',
      'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=800',
    ],
    items: [
      { titleUk: 'Клінінг квартир', titleRu: 'Клининг квартир', descUk: 'Після ремонту.', descRu: 'После ремонта.', price: '120' },
      { titleUk: 'Ремонт побутової техніки', titleRu: 'Ремонт бытовой техники', descUk: 'Холодильники, пральні.', descRu: 'Холодильники, стиральные.', price: '45' },
      { titleUk: 'Перевезення меблів', titleRu: 'Перевозка мебели', descUk: 'Газель.', descRu: 'Газель.', price: '65' },
      { titleUk: 'Фотосесія портрет', titleRu: 'Фотосессия портрет', descUk: '1 година, ретуш.', descRu: '1 час, ретушь.', price: '95' },
      { titleUk: 'Репетитор математика', titleRu: 'Репетитор математика', descUk: 'Онлайн.', descRu: 'Онлайн.', price: '25' },
      { titleUk: 'Переклад документів', titleRu: 'Перевод документов', descUk: 'UA/EN/DE.', descRu: 'UA/EN/DE.', price: '18' },
      { titleUk: 'Сайт під ключ', titleRu: 'Сайт под ключ', descUk: 'Лендінг до 5 стор.', descRu: 'Лендинг до 5 стр.', price: '380' },
      { titleUk: 'Консультація юриста', titleRu: 'Консультация юриста', descUk: '1 година.', descRu: '1 час.', price: '55' },
      { titleUk: 'Масаж класичний', titleRu: 'Массаж классический', descUk: '60 хв.', descRu: '60 мин.', price: '42' },
      { titleUk: 'Догляд за тваринами', titleRu: 'Уход за животными', descUk: 'Вигул, годівля.', descRu: 'Выгул, кормление.', price: '22' },
    ],
  },
];

function buildTestListings(): Array<{
  title: string;
  description: string;
  price: string;
  currency: string;
  category: string;
  subcategory: string;
  condition: string;
  location: string;
  images: string[];
}> {
  const out: Array<{
    title: string;
    description: string;
    price: string;
    currency: string;
    category: string;
    subcategory: string;
    condition: string;
    location: string;
    images: string[];
  }> = [];
  const conditions = ['new', 'like_new', 'good', 'fair'] as const;
  let idx = 0;
  for (const config of CATEGORIES_CONFIG) {
    for (let i = 0; i < config.items.length; i++) {
      const item = config.items[i];
      const isRu = idx % 2 === 1;
      const city = Math.random() < 0.8 ? 'Nürnberg' : GERMAN_CITIES[idx % GERMAN_CITIES.length];
      out.push({
        title: isRu ? item.titleRu : item.titleUk,
        description: isRu ? item.descRu : item.descUk,
        price: item.price,
        currency: 'EUR',
        category: config.category,
        subcategory: config.subcategory,
        condition: conditions[i % conditions.length],
        location: city,
        images: [config.images[i % config.images.length], config.images[(i + 1) % config.images.length]],
      });
      idx++;
    }
  }
  return out;
}

/** Випадкова дата з 1 по 20 січня 2026 (заднім числом для тестових оголошень). */
function randomDateJan2026(): string {
  const day = 1 + Math.floor(Math.random() * 20);
  const hour = Math.floor(Math.random() * 24);
  const min = Math.floor(Math.random() * 60);
  const sec = Math.floor(Math.random() * 60);
  const d = `${day.toString().padStart(2, '0')}`;
  const h = `${hour.toString().padStart(2, '0')}`;
  const m = `${min.toString().padStart(2, '0')}`;
  const s = `${sec.toString().padStart(2, '0')}`;
  return `2026-01-${d} ${h}:${m}:${s}`;
}

async function downloadAvatar(telegramId: number): Promise<string> {
  const url = `https://i.pravatar.cc/400?u=${telegramId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch avatar');
  const buffer = Buffer.from(await res.arrayBuffer());
  const uploadsDir = join(process.cwd(), 'public', 'avatars');
  if (!existsSync(uploadsDir)) await mkdir(uploadsDir, { recursive: true });
  const filename = `avatar_${telegramId}.jpg`;
  const filepath = join(uploadsDir, filename);
  await writeFile(filepath, buffer);
  return `/avatars/${filename}`;
}

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}

async function handle(_request: NextRequest) {
  try {
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const userIds: number[] = [];

    for (const u of TEST_USERS) {
      const avatarPath = await downloadAvatar(u.telegramId);
      const existingRows = await prisma.$queryRawUnsafe<UserRow[]>(
        'SELECT id, firstName, lastName, avatar FROM User WHERE CAST(telegramId AS INTEGER) = ?',
        u.telegramId
      );
      const existing = existingRows[0];

      let userId: number;
      if (existing) {
        userId = existing.id;
        await prisma.$executeRawUnsafe(
          `UPDATE User SET firstName = ?, lastName = ?, avatar = ?, username = ?, updatedAt = ? WHERE id = ?`,
          u.firstName,
          u.lastName,
          avatarPath,
          u.username,
          now,
          userId
        );
        await prisma.$executeRawUnsafe('DELETE FROM Listing WHERE userId = ?', userId);
      } else {
        await prisma.$executeRawUnsafe(
          `INSERT INTO User (telegramId, username, firstName, lastName, avatar, balance, rating, reviewsCount, isActive, listingPackagesBalance, hasUsedFreeAd, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, 0, 5.0, 0, 1, 10, 0, ?, ?)`,
          u.telegramId,
          u.username,
          u.firstName,
          u.lastName,
          avatarPath,
          now,
          now
        );
        const inserted = await prisma.$queryRawUnsafe<{ id: number }[]>(
          'SELECT id FROM User WHERE CAST(telegramId AS INTEGER) = ?',
          u.telegramId
        );
        userId = inserted[0].id;
      }
      userIds.push(userId);
    }

    const testListings = buildTestListings();
    for (let i = 0; i < testListings.length; i++) {
      const item = testListings[i];
      const ownerId = userIds[i % userIds.length];
      const views = Math.floor(Math.random() * 80);
      const past = randomDateJan2026();
      await prisma.$executeRawUnsafe(
        `INSERT INTO Listing (userId, title, description, price, currency, isFree, category, subcategory, condition, location, images, status, moderationStatus, views, publishedAt, moderatedAt, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 'active', 'approved', ?, ?, ?, ?, ?)`,
        ownerId,
        item.title,
        item.description,
        item.price,
        item.currency,
        item.category,
        item.subcategory,
        item.condition,
        item.location,
        JSON.stringify(item.images),
        views,
        past,
        past,
        past,
        past
      );
    }

    const allListings = await prisma.$queryRawUnsafe<{ id: number; title: string; status: string; userId: number }[]>(
      `SELECT id, title, status, userId FROM Listing WHERE userId IN (${userIds.join(',')})`
    );

    return NextResponse.json({
      ok: true,
      users: TEST_USERS.map((u, idx) => ({
        id: userIds[idx],
        telegramId: String(u.telegramId),
        firstName: u.firstName,
        lastName: u.lastName,
        username: u.username,
        listingsCount: allListings.filter((l) => l.userId === userIds[idx]).length,
      })),
      listingsCount: allListings.length,
      listings: allListings.slice(0, 15).map((l) => ({ id: l.id, title: l.title, status: l.status })),
    });
  } catch (e) {
    console.error('[create-test-data]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
