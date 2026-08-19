/**
 * Облікові дані веб-адмінки (/admin).
 *
 * Docker: bot/.env (+ опційно app/.env через compose).
 * Локально npm run dev: app/.env
 */
export function resolveAdminCredentials():
  | { username: string; password: string }
  | null {
  const username = (
    process.env.ADMIN_USERNAME ||
    process.env.ADMIN_USER ||
    ''
  ).trim();
  const password = (
    process.env.ADMIN_PASSWORD ||
    process.env.ADMIN_PASS ||
    ''
  ).trim();

  if (!username || !password) {
    return null;
  }
  return { username, password };
}

export const ADMIN_CREDENTIALS_ENV_HINT =
  'Додайте ADMIN_USERNAME та ADMIN_PASSWORD у bot/.env (Docker) або app/.env (локально). ' +
  'ADMINISTRATORS — це Telegram ID для бота, не логін веб-панелі.';
