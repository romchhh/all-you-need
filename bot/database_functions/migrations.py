import sys
from typing import List, Dict, Any

from .telegram_listing_db import get_connection


NEW_CATEGORIES: List[Dict[str, Any]] = [
    {
        "name": "Послуги",
        "icon": "🛠️",
        "sortOrder": 1,
    },
    {
        "name": "Вакансія/пошук роботи",
        "icon": "💼",
        "sortOrder": 2,
    },
    {
        "name": "Доставка/перевезення",
        "icon": "🚚",
        "sortOrder": 3,
    },
    {
        "name": "Нерухомість",
        "icon": "🏠",
        "sortOrder": 4,
    },
    {
        "name": "Автопослуги",
        "icon": "🚗",
        "sortOrder": 5,
    },
    {
        "name": "Реклама бізнесу",
        "icon": "📢",
        "sortOrder": 6,
    },
    {
        "name": "Послуги для дітей",
        "icon": "🧸",
        "sortOrder": 7,
    },
    {
        "name": "Краса та здоров'я",
        "icon": "💅",
        "sortOrder": 8,
    },
    {
        "name": "Подія",
        "icon": "🎉",
        "sortOrder": 9,
    },
    {
        "name": "Інше",
        "icon": "❓",
        "sortOrder": 10,
    },
]


def apply_new_categories() -> None:
    """
    Замінює існуючі категорії на новий список:
    - Видаляє всі старі підкатегорії (де parentId IS NOT NULL)
    - Видаляє всі старі кореневі категорії (де parentId IS NULL)
    - Вставляє нові категорії
    """
    conn = get_connection()
    cursor = conn.cursor()

    # Спочатку видаляємо всі підкатегорії (де parentId IS NOT NULL)
    cursor.execute("DELETE FROM Category WHERE parentId IS NOT NULL")
    
    # Потім видаляємо всі кореневі категорії (де parentId IS NULL)
    cursor.execute("DELETE FROM Category WHERE parentId IS NULL")

    # Вставляємо нові категорії
    for cat in NEW_CATEGORIES:
        name = cat["name"]
        icon = cat["icon"]
        sort_order = cat["sortOrder"]
        
        cursor.execute(
            """
            INSERT INTO Category (name, icon, parentId, sortOrder, isActive, createdAt)
            VALUES (?, ?, NULL, ?, 1, CURRENT_TIMESTAMP)
            """,
            (name, icon, sort_order),
        )

    conn.commit()
    conn.close()


def ensure_categories_exist() -> None:
    """
    М'яка міграція: додає відсутні категорії та оновлює sortOrder.
    Не видаляє існуючі категорії. Викликається при запуску бота.
    """
    conn = get_connection()
    cursor = conn.cursor()

    for cat in NEW_CATEGORIES:
        name = cat["name"]
        icon = cat["icon"]
        sort_order = cat["sortOrder"]
        
        # Перевіряємо чи категорія існує
        cursor.execute(
            "SELECT id FROM Category WHERE name = ? AND parentId IS NULL",
            (name,)
        )
        existing = cursor.fetchone()
        
        if existing:
            # Оновлюємо sortOrder якщо категорія вже існує
            cursor.execute(
                "UPDATE Category SET sortOrder = ?, icon = ? WHERE name = ? AND parentId IS NULL",
                (sort_order, icon, name)
            )
        else:
            # Додаємо нову категорію
            cursor.execute(
                """
                INSERT INTO Category (name, icon, parentId, sortOrder, isActive, createdAt)
                VALUES (?, ?, NULL, ?, 1, CURRENT_TIMESTAMP)
                """,
                (name, icon, sort_order),
            )
            print(f"Додано нову категорію: {name}")

    conn.commit()
    conn.close()


def main() -> None:
    try:
        apply_new_categories()
        print("Категорії успішно оновлено.")
    except Exception as e:
        print(f"Помилка при оновленні категорій: {e}", file=sys.stderr)
        raise


if __name__ == "__main__":
    main()

