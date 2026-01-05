from os import getenv
from dotenv import load_dotenv

load_dotenv()

token = getenv('TOKEN')
bot_username = getenv('BOT_USERNAME', '')

administrators = [int(id) for id in getenv('ADMINISTRATORS')[1:-1].split(',')]

