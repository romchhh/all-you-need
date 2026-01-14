from database_functions.client_db import create_table 
from database_functions.links_db import create_table_links
from database_functions.admin_db import create_admins_table, init_superadmin
from database_functions.init_prisma_tables import init_prisma_tables
from config import administrators
from database_functions.migrations import apply_new_categories
from database_functions.telegram_listing_db import init_categories_if_empty

def create_dbs():
    init_prisma_tables()
    
    create_table()
    create_table_links()
    create_admins_table()
    init_categories_if_empty()
    apply_new_categories()
    
    if administrators:
        superadmin_id = administrators[0]
        init_superadmin(superadmin_id)

