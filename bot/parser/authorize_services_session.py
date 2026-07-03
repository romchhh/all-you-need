#!/usr/bin/env python3
"""
Авторизація резервного акаунта @opluger (parser_fallback_session).

Команда authorize_services_session теж веде сюди — старий +380 services більше не використовується.
"""

from parser.authorize_session import main

if __name__ == "__main__":
    main(["--fallback"])
