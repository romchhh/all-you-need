#!/bin/bash
# Отримуємо директорію скрипта
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Активація віртуального середовища
if [ -d "myenv/bin" ]; then
    source myenv/bin/activate
elif [ -d "venv/bin" ]; then
    source venv/bin/activate
elif [ -d "../venv/bin" ]; then
    source ../venv/bin/activate
fi

# Запуск бота
pip install -q -r requirements.txt 2>/dev/null || pip3 install -q -r requirements.txt 2>/dev/null || true
nohup python3 main.py > bot.log 2>&1 &
echo "Bot started (PID: $!)"
echo "Logs: $SCRIPT_DIR/bot.log"