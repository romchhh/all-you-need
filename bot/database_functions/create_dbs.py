from database_functions.client_db import create_table 
from database_functions.links_db import create_table_links
from database_functions.admin_db import create_admins_table, init_superadmin
from database_functions.init_prisma_tables import init_prisma_tables
from config import administrators


def create_dbs():
    # Спочатку ініціалізуємо Prisma таблиці (основні)
    init_prisma_tables()
    
    # Створюємо legacy таблиці для сумісності
    create_table()
    create_table_links()
    create_admins_table()
    
    # Ініціалізуємо суперадміна
    if administrators:
        superadmin_id = administrators[0]
        init_superadmin(superadmin_id)

