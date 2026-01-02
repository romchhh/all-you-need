"""
Скрипт для додавання тестових даних:
- Створює кілька користувачів
- Додає 20 товарів в різні категорії
"""
import sqlite3
import json
from datetime import datetime, timedelta
from pathlib import Path
import random

# Шлях до бази даних
BASE_DIR = Path(__file__).resolve().parent.parent.parent
DB_PATH = BASE_DIR / "database" / "ayn_marketplace.db"
DATABASE_PATH = str(DB_PATH)

# Підключення до БД
conn = sqlite3.connect(DATABASE_PATH, check_same_thread=False)
cursor = conn.cursor()

# Тестові користувачі
test_users = [
    {
        'telegramId': 100001,
        'username': 'test_user_1',
        'firstName': 'Олександр',
        'lastName': 'Петренко',
        'phone': '+380501234567'
    },
    {
        'telegramId': 100002,
        'username': 'test_user_2',
        'firstName': 'Марія',
        'lastName': 'Іваненко',
        'phone': '+380502345678'
    },
    {
        'telegramId': 100003,
        'username': 'test_user_3',
        'firstName': 'Дмитро',
        'lastName': 'Коваленко',
        'phone': '+380503456789'
    },
    {
        'telegramId': 100004,
        'username': 'test_user_4',
        'firstName': 'Олена',
        'lastName': 'Шевченко',
        'phone': '+380504567890'
    },
    {
        'telegramId': 100005,
        'username': 'test_user_5',
        'firstName': 'Андрій',
        'lastName': 'Мельник',
        'phone': '+380505678901'
    }
]

# Тестові товари
test_listings = [
    {
        'title': 'iPhone 13 Pro Max 256GB',
        'description': 'Смартфон в ідеальному стані. Використовувався 6 місяців. Всі аксесуари в комплекті. Екран без подряпин.',
        'price': '25000',
        'isFree': 0,
        'category': 'electronics',
        'subcategory': 'smartphones',
        'condition': 'like_new',
        'location': 'Київ, Печерськ'
    },
    {
        'title': 'Диван-кровать з підлокітниками',
        'description': 'Комфортний диван-кровать, розмір 200x90 см. М\'яка оббивка, зручні подушки. Відмінний стан.',
        'price': '4500',
        'isFree': 0,
        'category': 'furniture',
        'subcategory': 'sofas_chairs',
        'condition': 'good',
        'location': 'Львів, Центр'
    },
    {
        'title': 'Жіноча куртка зимова',
        'description': 'Тепла зимова куртка, розмір 42. Нова, з тегами. Не підійшла за розміром.',
        'price': '1200',
        'isFree': 0,
        'category': 'fashion',
        'subcategory': 'women_clothing',
        'condition': 'new',
        'location': 'Одеса, Приморський район'
    },
    {
        'title': 'Ноутбук HP Pavilion 15',
        'description': 'Ноутбук для роботи та навчання. Intel Core i5, 8GB RAM, 256GB SSD. Працює ідеально.',
        'price': '15000',
        'isFree': 0,
        'category': 'electronics',
        'subcategory': 'computers_laptops',
        'condition': 'good',
        'location': 'Харків, Салтівка'
    },
    {
        'title': 'Дитяча коляска трансформер',
        'description': 'Коляска для дитини від 0 до 3 років. Всі аксесуари, сонячний козирок, кошик для новонароджених.',
        'price': '3500',
        'isFree': 0,
        'category': 'kids',
        'subcategory': 'strollers_car_seats',
        'condition': 'good',
        'location': 'Дніпро, Центр'
    },
    {
        'title': 'Холодильник Samsung',
        'description': 'Двокамерний холодильник, об\'єм 350 літрів. Нофрост, енергоклас А+. Працює бездоганно.',
        'price': '8000',
        'isFree': 0,
        'category': 'appliances',
        'subcategory': 'large_appliances',
        'condition': 'like_new',
        'location': 'Запоріжжя, Хортицький район'
    },
    {
        'title': 'Набір посуду на 6 персон',
        'description': 'Повний набір кухонного посуду: тарілки, чашки, склянки, столові прибори. Всі предмети в гарному стані.',
        'price': '800',
        'isFree': 0,
        'category': 'home',
        'subcategory': 'dishes',
        'condition': 'good',
        'location': 'Вінниця, Центр'
    },
    {
        'title': 'Велосипед горний',
        'description': 'Горний велосипед, 21 швидкість. Рама 19 дюймів. Підходить для дорослих. Відмінний стан.',
        'price': '5500',
        'isFree': 0,
        'category': 'hobby_sports',
        'subcategory': 'bikes_scooters',
        'condition': 'good',
        'location': 'Івано-Франківськ, Центр'
    },
    {
        'title': 'Квартира 2 кімнати в оренду',
        'description': 'Світла квартира в центрі міста. Повна мебльована, є вся техніка. Оренда довгострокова.',
        'price': '12000',
        'isFree': 0,
        'category': 'realestate',
        'subcategory': 'rent_apartments',
        'condition': None,
        'location': 'Київ, Оболонь'
    },
    {
        'title': 'Дитячі іграшки',
        'description': 'Набір дитячих іграшок: конструктор, ляльки, машинки. Всі в хорошому стані, без пошкоджень.',
        'price': 'Безкоштовно',
        'isFree': 1,
        'category': 'free',
        'subcategory': None,
        'condition': 'good',
        'location': 'Полтава, Центр'
    },
    {
        'title': 'Чоловічі кросівки Nike',
        'description': 'Спортивні кросівки, розмір 42. Носилися кілька разів, виглядають як нові.',
        'price': '1500',
        'isFree': 0,
        'category': 'fashion',
        'subcategory': 'men_shoes',
        'condition': 'like_new',
        'location': 'Чернівці, Центр'
    },
    {
        'title': 'Шафа-купе 3-дверна',
        'description': 'Велика шафа-купе з дзеркалами. Висота 2.4 м, ширина 2 м. Відмінний стан, всі механізми працюють.',
        'price': '6000',
        'isFree': 0,
        'category': 'furniture',
        'subcategory': 'wardrobes_chests',
        'condition': 'good',
        'location': 'Тернопіль, Центр'
    },
    {
        'title': 'Телевізор Samsung 55"',
        'description': 'Smart TV з підтримкою 4K. Відмінна картинка, всі функції працюють. Пульт в комплекті.',
        'price': '18000',
        'isFree': 0,
        'category': 'electronics',
        'subcategory': 'tv_audio',
        'condition': 'like_new',
        'location': 'Луцьк, Центр'
    },
    {
        'title': 'Пральна машина Indesit',
        'description': 'Автоматична пральна машина, завантаження 6 кг. Всі режими працюють, без пошкоджень.',
        'price': '4500',
        'isFree': 0,
        'category': 'appliances',
        'subcategory': 'large_appliances',
        'condition': 'good',
        'location': 'Рівне, Центр'
    },
    {
        'title': 'Дитячий одяг 2-3 роки',
        'description': 'Набір дитячого одягу: футболки, штани, светри. Всі речі чисті, в хорошому стані.',
        'price': '500',
        'isFree': 0,
        'category': 'kids',
        'subcategory': 'clothing',
        'condition': 'good',
        'location': 'Ужгород, Центр'
    },
    {
        'title': 'Настільна лампа з LED',
        'description': 'Сучасна настільна лампа з LED підсвіткою. Регулювання яскравості, стильний дизайн.',
        'price': '400',
        'isFree': 0,
        'category': 'home',
        'subcategory': 'lighting',
        'condition': 'new',
        'location': 'Хмельницький, Центр'
    },
    {
        'title': 'Гітара акустична',
        'description': 'Акустична гітара, 6 струн. Відмінний звук, зручна для гри. Футляр в комплекті.',
        'price': '2500',
        'isFree': 0,
        'category': 'hobby_sports',
        'subcategory': 'music_instruments',
        'condition': 'good',
        'location': 'Черкаси, Центр'
    },
    {
        'title': 'Автомобільні шини 205/55 R16',
        'description': 'Комплект зимових шин. Залишок протектора 70%. Відмінний стан, без пошкоджень.',
        'price': '3500',
        'isFree': 0,
        'category': 'auto',
        'subcategory': 'tires_wheels',
        'condition': 'good',
        'location': 'Кропивницький, Центр'
    },
    {
        'title': 'Послуги репетитора з математики',
        'description': 'Пропоную послуги репетитора з математики для учнів 5-11 класів. Досвід 10 років. Онлайн або офлайн.',
        'price': '300',
        'isFree': 0,
        'category': 'services_work',
        'subcategory': 'education_tutors',
        'condition': None,
        'location': 'Київ, Шевченківський район'
    },
    {
        'title': 'Книги та журнали',
        'description': 'Колекція книг різних жанрів та журналів. Всі в хорошому стані. Віддам безкоштовно.',
        'price': 'Безкоштовно',
        'isFree': 1,
        'category': 'free',
        'subcategory': None,
        'condition': 'good',
        'location': 'Суми, Центр'
    }
]

def create_test_users():
    """Створює тестових користувачів"""
    print("Створення тестових користувачів...")
    current_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    
    for user in test_users:
        # Перевіряємо чи користувач вже існує
        cursor.execute("SELECT id FROM User WHERE telegramId = ?", (user['telegramId'],))
        existing = cursor.fetchone()
        
        if existing:
            print(f"Користувач {user['telegramId']} вже існує, пропускаємо...")
            continue
        
        # Створюємо користувача
        cursor.execute('''
            INSERT INTO User (
                telegramId, username, firstName, lastName, phone, 
                balance, reviewsCount, isActive, createdAt, updatedAt
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            user['telegramId'],
            user['username'],
            user['firstName'],
            user['lastName'],
            user['phone'],
            0.0,  # balance
            0,    # reviewsCount
            1,    # isActive
            current_time,
            current_time
        ))
        print(f"✓ Створено користувача: {user['firstName']} {user['lastName']} (@{user['username']})")
    
    conn.commit()
    print(f"\nСтворено/перевірено {len(test_users)} користувачів\n")

def create_test_listings():
    """Створює тестові товари"""
    print("Створення тестових товарів...")
    
    # Отримуємо ID користувачів
    cursor.execute("SELECT id, telegramId FROM User WHERE telegramId >= 100001 AND telegramId <= 100005")
    users = cursor.fetchall()
    
    if not users:
        print("Помилка: не знайдено тестових користувачів!")
        return
    
    user_ids = [user[0] for user in users]
    current_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    
    # Створюємо товари з різними датами (останні 30 днів)
    for i, listing_data in enumerate(test_listings):
        # Вибираємо випадкового користувача
        user_id = random.choice(user_ids)
        
        # Генеруємо випадкову дату в межах останніх 30 днів
        days_ago = random.randint(0, 30)
        created_at = (datetime.now() - timedelta(days=days_ago)).strftime('%Y-%m-%d %H:%M:%S')
        
        # Формуємо images як JSON (порожній масив для текстових товарів)
        images_json = json.dumps([])
        
        # Формуємо tags як JSON (можна додати теги)
        tags = []
        if listing_data['isFree']:
            tags.append('безкоштовно')
        if listing_data['condition'] == 'new':
            tags.append('новий')
        elif listing_data['condition'] == 'like_new':
            tags.append('як новий')
        tags_json = json.dumps(tags) if tags else None
        
        # Визначаємо price
        price = listing_data['price']
        if listing_data['isFree']:
            price = '0'
        
        # Створюємо товар
        cursor.execute('''
            INSERT INTO Listing (
                userId, title, description, price, isFree, category, subcategory,
                condition, location, images, tags, status, views,
                createdAt, updatedAt, publishedAt
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            user_id,
            listing_data['title'],
            listing_data['description'],
            price,
            1 if listing_data['isFree'] else 0,
            listing_data['category'],
            listing_data['subcategory'],
            listing_data['condition'],
            listing_data['location'],
            images_json,
            tags_json,
            'active',  # status
            random.randint(0, 150),  # views
            created_at,
            created_at,
            created_at
        ))
        
        print(f"✓ Створено товар: {listing_data['title']} ({listing_data['category']})")
    
    conn.commit()
    print(f"\nСтворено {len(test_listings)} товарів\n")

def main():
    """Головна функція"""
    print("=" * 60)
    print("Додавання тестових даних до бази даних")
    print("=" * 60)
    print()
    
    try:
        # Створюємо користувачів
        create_test_users()
        
        # Створюємо товари
        create_test_listings()
        
        print("=" * 60)
        print("✓ Тестові дані успішно додано!")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n✗ Помилка: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == '__main__':
    main()

