from os import getenv
from dotenv import load_dotenv

load_dotenv()

token = getenv('TOKEN')
bot_username = getenv('BOT_USERNAME', '')

administrators = [int(id) for id in getenv('ADMINISTRATORS')[1:-1].split(',')]

MONOBANK_TOKEN = getenv('MONOBANK_TOKEN')

# Підтримка TradeGround (не з .env)
SUPPORT_USERNAME = 'tradeground_support'
SUPPORT_MANAGER = f'https://t.me/{SUPPORT_USERNAME}'