'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface ImportResult {
  success: number;
  failed: number;
  skipped: number;
  errors: string[];
}

export default function ImportListingsPage() {
  const router = useRouter();
  const [jsonFile, setJsonFile] = useState<File | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [progress, setProgress] = useState('');

  const handleJsonChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setJsonFile(e.target.files[0]);
    }
  };

  const handleZipChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setZipFile(e.target.files[0]);
    }
  };

  const handleImport = async () => {
    if (!jsonFile) {
      alert('Будь ласка, виберіть JSON файл');
      return;
    }

    setLoading(true);
    setResult(null);
    setProgress('Завантаження файлів...');

    try {
      const formData = new FormData();
      formData.append('json', jsonFile);
      if (zipFile) {
        formData.append('zip', zipFile);
      }

      const response = await fetch('/api/admin/listings/import', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Помилка імпорту');
      }

      setResult({
        success: data.success || 0,
        failed: data.failed || 0,
        skipped: data.skipped || 0,
        errors: data.errors || [],
      });

      setProgress('Імпорт завершено!');
    } catch (error) {
      console.error('Import error:', error);
      setResult({
        success: 0,
        failed: 0,
        skipped: 0,
        errors: [error instanceof Error ? error.message : 'Невідома помилка'],
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Імпорт оголошень
        </h1>
        <p className="text-gray-600">
          Завантажте JSON файл з оголошеннями та ZIP архів з фотографіями
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6 space-y-6">
        {/* JSON файл */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            JSON файл з оголошеннями <span className="text-red-500">*</span>
          </label>
          <input
            type="file"
            accept=".json,application/json"
            onChange={handleJsonChange}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
            disabled={loading}
          />
          {jsonFile && (
            <p className="mt-2 text-sm text-gray-600">
              Вибрано: {jsonFile.name} ({(jsonFile.size / 1024).toFixed(2)} KB)
            </p>
          )}
        </div>

        {/* ZIP файл */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            ZIP архів з фотографіями (опціонально)
          </label>
          <input
            type="file"
            accept=".zip,application/zip"
            onChange={handleZipChange}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
            disabled={loading}
          />
          {zipFile && (
            <p className="mt-2 text-sm text-gray-600">
              Вибрано: {zipFile.name} ({(zipFile.size / 1024 / 1024).toFixed(2)} MB)
            </p>
          )}
        </div>

        {/* Кнопка імпорту */}
        <div className="flex gap-4">
          <button
            onClick={handleImport}
            disabled={loading || !jsonFile}
            className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {loading ? 'Імпорт...' : 'Почати імпорт'}
          </button>
          <button
            onClick={() => router.back()}
            className="px-6 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
          >
            Назад
          </button>
        </div>

        {/* Прогрес */}
        {loading && progress && (
          <div className="mt-4 p-4 bg-blue-50 rounded-md">
            <p className="text-blue-800">{progress}</p>
          </div>
        )}

        {/* Результати */}
        {result && (
          <div className={`mt-4 p-4 rounded-md ${
            result.failed === 0 ? 'bg-green-50' : 'bg-yellow-50'
          }`}>
            <h3 className="font-semibold mb-2">
              Результати імпорту:
            </h3>
            <p className="text-green-700">
              Успішно імпортовано: <strong>{result.success}</strong>
            </p>
            {result.failed > 0 && (
              <p className="text-red-700 mt-1">
                Помилок: <strong>{result.failed}</strong>
              </p>
            )}
            {result.skipped > 0 && (
              <p className="text-gray-700 mt-1">
                Пропущено дублікатів: <strong>{result.skipped}</strong>
              </p>
            )}
            {result.errors.length > 0 && (
              <div className="mt-3">
                <p className="font-semibold text-red-700 mb-1">Помилки:</p>
                <ul className="list-disc list-inside text-sm text-red-600 space-y-1">
                  {result.errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Інструкція */}
        <div className="mt-6 p-4 bg-gray-50 rounded-md">
          <h3 className="font-semibold mb-2">Формат JSON файлу:</h3>
          <pre className="text-xs bg-white p-3 rounded border overflow-x-auto">
{`[
  {
    "telegramId": "123456789",
    "title": "Назва товару",
    "description": "Опис товару",
    "price": "100",
    "currency": "EUR",
    "isFree": false,
    "category": "electronics",
    "subcategory": "smartphones",
    "location": "Гамбург",
    "condition": "used",
    "images": ["photo1.jpg", "photo2.jpg"]
  }
]`}
          </pre>
          <p className="text-sm text-gray-600 mt-2">
            Фотографії в ZIP архіві повинні мати ті ж назви, що вказані в полі "images" кожного оголошення.
          </p>
        </div>
      </div>
    </div>
  );
}
