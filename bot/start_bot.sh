#!/bin/bash
source /root/AllYouNeed/bot/myenv/bin/activate
nohup python3 /root/AllYouNeed/bot/main.py > /dev/null 2>&1 &
echo "Bot started"