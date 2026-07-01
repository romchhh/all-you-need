/** Динамічний доступ до fs — не аналізується Turbopack як broad file pattern. */

export async function readFileBuffer(path: string): Promise<Buffer> {
  const { readFile } = await import('node:fs/promises');
  return readFile(path);
}

export async function statFile(path: string) {
  const { stat } = await import('node:fs/promises');
  return stat(path);
}

export async function unlinkFile(path: string): Promise<void> {
  const { unlink } = await import('node:fs/promises');
  await unlink(path);
}

export async function readdirNames(dir: string): Promise<string[]> {
  const { readdir } = await import('node:fs/promises');
  return readdir(dir);
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await statFile(path);
    return true;
  } catch {
    return false;
  }
}
