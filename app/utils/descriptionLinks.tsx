import React from 'react';

/**
 * Перетворює текст опису на React-елементи з клікабельними посиланнями:
 * - @username → посилання на t.me/username
 * - URL (http/https/t.me) → клікабельні посилання
 */
export function descriptionWithLinks(text: string): React.ReactNode[] {
  if (!text || typeof text !== 'string') return [text || ''];

  const result: React.ReactNode[] = [];
  const combinedRegex = /@([a-zA-Z][a-zA-Z0-9_]{4,31})(?=\s|$|[^\w])|(https?:\/\/[^\s]+|t\.me\/[a-zA-Z0-9_]+)/g;

  let lastIndex = 0;
  let match;

  while ((match = combinedRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      result.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      const username = match[1];
      const href = `https://t.me/${username}`;
      result.push(
        <a
          key={`tg-${match.index}-${username}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 underline break-all"
        >
          @{username}
        </a>
      );
    } else if (match[2]) {
      let url = match[2];
      url = url.replace(/[.,;:!?)]+$/, '');
      const displayUrl = url.length > 50 ? url.slice(0, 47) + '…' : url;
      const safeHref = url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
      result.push(
        <a
          key={`url-${match.index}`}
          href={safeHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 underline break-all"
        >
          {displayUrl}
        </a>
      );
    }

    lastIndex = combinedRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    result.push(text.slice(lastIndex));
  }

  return result.length > 0 ? result : [text];
}
