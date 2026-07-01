import { join } from 'path';
import { readdirNames, unlinkFile } from '@/lib/server/nodeFs';

const SAFE_FILENAME = /^[a-zA-Z0-9._-]+$/;

/** Видаляє старі аватари користувача (avatar_{telegramId}.*). */
export async function deleteUserAvatarFiles(telegramId: string): Promise<void> {
  if (!/^\d+$/.test(telegramId)) return;

  const prefix = `avatar_${telegramId}`;
  const avatarsDir = join(process.cwd(), 'public', 'avatars');

  let files: string[];
  try {
    files = await readdirNames(avatarsDir);
  } catch {
    return;
  }

  for (const file of files) {
    if (!SAFE_FILENAME.test(file)) continue;
    if (!file.startsWith(`${prefix}.`) && !file.startsWith(`${prefix}_`)) continue;
    try {
      await unlinkFile(join(avatarsDir, file));
    } catch {
      /* ignore */
    }
  }
}
