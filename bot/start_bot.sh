#!/bin/bash
source /root/Bot/myenv/bin/activate
nohup python3 /root/Bot/main.py > /dev/null 2>&1 &
