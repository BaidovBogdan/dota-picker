import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import { safeStorage } from 'electron';

export class TokenVault {
  constructor(private readonly filePath: string) {}

  async read(): Promise<string | null> {
    if (!safeStorage.isEncryptionAvailable()) return null;
    try {
      const encrypted = await fs.readFile(this.filePath);
      return safeStorage.decryptString(encrypted);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      await this.clear();
      return null;
    }
  }

  async write(refreshToken: string): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Защищённое хранилище операционной системы недоступно');
    }
    const encrypted = safeStorage.encryptString(refreshToken);
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await fs.mkdir(dirname(this.filePath), { recursive: true });
    await fs.writeFile(temporaryPath, encrypted, { mode: 0o600 });
    await fs.rename(temporaryPath, this.filePath);
  }

  async clear(): Promise<void> {
    try {
      await fs.unlink(this.filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}
