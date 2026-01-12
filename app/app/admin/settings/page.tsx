'use client';

import { useState, useEffect } from 'react';

export default function SettingsPage() {
  const [paidListingsEnabled, setPaidListingsEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/admin/settings');
      const data = await response.json();
      
      if (response.ok) {
        setPaidListingsEnabled(data.settings?.paidListingsEnabled || false);
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'paidListingsEnabled',
          value: paidListingsEnabled,
          description: 'Enable or disable paid listings system',
        }),
      });

      if (response.ok) {
        alert('Налаштування збережено');
      } else {
        alert('Помилка збереження');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Помилка збереження');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Налаштування системи</h1>
        <p className="text-gray-600">Керування основними параметрами платформи</p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="space-y-6">
          {/* Платні оголошення */}
          <div className="flex items-start justify-between pb-6 border-b border-gray-200">
            <div className="flex-1 pr-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Платні оголошення
              </h3>
              <p className="text-gray-600 text-sm mb-3">
                Коли увімкнено, користувачі повинні платити за оголошення (окрім першого безкоштовного).
                Всі платні оголошення потрапляють на модерацію перед публікацією.
              </p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-900 mb-2">📋 Як це працює:</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>✓ Перше оголошення - безкоштовно</li>
                  <li>✓ Наступні оголошення - платні (пакети 1, 5, 10)</li>
                  <li>✓ Всі платні оголошення йдуть на модерацію</li>
                  <li>✓ При відхиленні кошти повертаються</li>
                </ul>
              </div>
            </div>
            
            <div className="flex-shrink-0">
              <button
                onClick={() => setPaidListingsEnabled(!paidListingsEnabled)}
                className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                  paidListingsEnabled ? 'bg-green-500' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                    paidListingsEnabled ? 'translate-x-7' : 'translate-x-1'
                  }`}
                />
              </button>
              <p className={`text-sm font-medium mt-2 ${
                paidListingsEnabled ? 'text-green-600' : 'text-gray-500'
              }`}>
                {paidListingsEnabled ? 'Увімкнено' : 'Вимкнено'}
              </p>
            </div>
          </div>

          {/* Тарифи */}
          <div className="pb-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Тарифи
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Пакети оголошень */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-3">📦 Пакети оголошень</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">1 оголошення:</span>
                    <span className="font-medium">2€</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">5 оголошень:</span>
                    <span className="font-medium">8€</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">10 оголошень:</span>
                    <span className="font-medium">14€</span>
                  </div>
                </div>
              </div>

              {/* Реклама */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-3">📣 Реклама (7 днів)</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Виділення кольором:</span>
                    <span className="font-medium">1,5€</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">TOP категорії:</span>
                    <span className="font-medium">2€</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">VIP оголошення:</span>
                    <span className="font-medium">4,5€</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Кнопка збереження */}
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Збереження...' : '💾 Зберегти налаштування'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
