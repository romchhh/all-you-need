#!/bin/bash

# Тестовий скрипт для перевірки API модерації
# Використання: ./scripts/test-moderation.sh [BASE_URL]
# Приклад: ./scripts/test-moderation.sh http://localhost:3000

BASE_URL="${1:-http://localhost:3000}"

echo "🚀 Тестування API модерації"
echo "Base URL: $BASE_URL"
echo "=================================="

# Кольори для виводу
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Функція для тестування endpoint
test_endpoint() {
    local name=$1
    local url=$2
    local method=${3:-GET}
    local data=${4:-""}
    
    echo ""
    echo "🧪 Тестування: $name"
    echo "   $method $url"
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" "$url")
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" \
            -H "Content-Type: application/json" \
            -d "$data" \
            "$url")
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
        echo -e "${GREEN}✅ Успішно (HTTP $http_code)${NC}"
        
        # Перевірка структури відповіді
        if echo "$body" | grep -q '"listings"'; then
            listings_count=$(echo "$body" | grep -o '"listings":\[.*\]' | grep -o '\]' | wc -l || echo "0")
            echo "   Знайдено оголошень: $(echo "$body" | jq '.listings | length' 2>/dev/null || echo 'N/A')"
            echo "   Всього: $(echo "$body" | jq '.total' 2>/dev/null || echo 'N/A')"
        fi
        return 0
    else
        echo -e "${RED}❌ Помилка (HTTP $http_code)${NC}"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
        return 1
    fi
}

# Підрахунок результатів
passed=0
failed=0

# Тест 1: Marketplace listings
if test_endpoint "GET Marketplace Listings" "$BASE_URL/api/admin/moderation/marketplace?status=pending"; then
    ((passed++))
else
    ((failed++))
fi

# Тест 2: Telegram listings
if test_endpoint "GET Telegram Listings" "$BASE_URL/api/admin/moderation/telegram?status=pending"; then
    ((passed++))
else
    ((failed++))
fi

# Тест 3: Marketplace з пагінацією
if test_endpoint "GET Marketplace with pagination" "$BASE_URL/api/admin/moderation/marketplace?status=pending&limit=10&offset=0"; then
    ((passed++))
else
    ((failed++))
fi

# Тест 4: Telegram з пагінацією
if test_endpoint "GET Telegram with pagination" "$BASE_URL/api/admin/moderation/telegram?status=pending&limit=10&offset=0"; then
    ((passed++))
else
    ((failed++))
fi

# Тест 5: Старий endpoint (deprecated)
if test_endpoint "GET All Listings (deprecated)" "$BASE_URL/api/admin/moderation?status=pending"; then
    ((passed++))
else
    ((failed++))
fi

# Підсумок
echo ""
echo "=================================="
echo "📊 Підсумок:"
echo -e "${GREEN}✅ Пройдено: $passed${NC}"
echo -e "${RED}❌ Не пройдено: $failed${NC}"

if [ $failed -eq 0 ]; then
    echo -e "${GREEN}🎉 Всі тести пройдено успішно!${NC}"
    exit 0
else
    echo -e "${YELLOW}⚠️  Деякі тести не пройдено${NC}"
    exit 1
fi
