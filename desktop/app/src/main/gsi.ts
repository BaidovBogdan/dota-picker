import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { createServer, type Server } from 'node:http';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';

const payloadSchema = z.object({
  auth: z.object({ token: z.string().optional() }).optional(),
  map: z.object({ game_state: z.string().optional() }).optional(),
  player: z.object({
    team_name: z.string().optional(),
  }).optional(),
});

export type GsiPayload = z.infer<typeof payloadSchema>;
export type DraftAllyGroup = 'left' | 'right';
export type GsiTeam = 'radiant' | 'dire';

export function parseGsiPayload(value: unknown): GsiPayload {
  return payloadSchema.parse(value);
}

export function resolveGsiTeam(payload: GsiPayload): GsiTeam | null {
  const teamName = payload.player?.team_name?.trim().toLowerCase();
  if (teamName === 'radiant' || teamName === 'dire') return teamName;
  return null;
}

export function resolveConfiguredAllyGroup(
  team: GsiTeam | null,
  radiantSide: DraftAllyGroup | null,
): DraftAllyGroup | null {
  if (!team || !radiantSide) return null;
  if (team === 'radiant') return radiantSide;
  return radiantSide === 'left' ? 'right' : 'left';
}

const cfgName = 'gamestate_integration_counterpick.cfg';
const execFileAsync = promisify(execFile);

async function pathExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

function unescapeVdfPath(value: string): string {
  return value.replace(/\\\\/g, '\\');
}

async function steamRoots(): Promise<string[]> {
  const candidates = new Set<string>();
  if (process.platform === 'win32') {
    const programFilesX86 = process.env['ProgramFiles(x86)'];
    const programFiles = process.env.ProgramFiles;
    if (programFilesX86) candidates.add(join(programFilesX86, 'Steam'));
    if (programFiles) candidates.add(join(programFiles, 'Steam'));
    try {
      const { stdout } = await execFileAsync('reg.exe', [
        'query',
        'HKCU\\Software\\Valve\\Steam',
        '/v',
        'SteamPath',
      ], { windowsHide: true, encoding: 'utf8' });
      const match = stdout.match(/SteamPath\s+REG_\w+\s+(.+)$/m);
      if (match?.[1]) candidates.add(match[1].trim());
    } catch {
      candidates.delete('');
    }
  } else if (process.platform === 'darwin') {
    candidates.add(join(homedir(), 'Library', 'Application Support', 'Steam'));
  } else {
    candidates.add(join(homedir(), '.steam', 'steam'));
    candidates.add(join(homedir(), '.local', 'share', 'Steam'));
  }

  for (const root of [...candidates]) {
    try {
      const vdf = await fs.readFile(join(root, 'steamapps', 'libraryfolders.vdf'), 'utf8');
      for (const match of vdf.matchAll(/"path"\s+"([^"]+)"/g)) {
        candidates.add(unescapeVdfPath(match[1]));
      }
    } catch {
      continue;
    }
  }
  return [...candidates];
}

export class GsiReceiver {
  private server: Server | null = null;
  private token = '';
  private onPayload: ((payload: GsiPayload) => void) | null = null;
  private activePort: number;

  constructor(
    private readonly statePath: string,
    private readonly port = 32123,
  ) {
    this.activePort = port;
  }

  async start(listener: (payload: GsiPayload) => void): Promise<{
    installed: boolean;
    configPath: string | null;
  }> {
    if (this.server) return { installed: true, configPath: null };
    this.onPayload = listener;
    this.token = await this.loadToken();
    let lastError: unknown;
    for (let offset = 0; offset < 8; offset += 1) {
      const candidate = createServer((request, response) => {
        void this.handleRequest(request, response);
      });
      try {
        await new Promise<void>((resolve, reject) => {
          candidate.once('error', reject);
          candidate.listen(this.port + offset, '127.0.0.1', () => {
            candidate.removeListener('error', reject);
            resolve();
          });
        });
        this.server = candidate;
        this.activePort = this.port + offset;
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!this.server) throw lastError ?? new Error('Не удалось открыть локальный GSI-порт');
    return this.installConfig();
  }

  async stop(): Promise<void> {
    this.onPayload = null;
    const active = this.server;
    this.server = null;
    if (!active) return;
    await new Promise<void>((resolve) => active.close(() => resolve()));
  }

  private async handleRequest(
    request: import('node:http').IncomingMessage,
    response: import('node:http').ServerResponse,
  ): Promise<void> {
    if (request.method !== 'POST' || request.url !== `/gsi/${this.token}`) {
      response.writeHead(404).end();
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > 1024 * 1024) {
        response.writeHead(413).end();
        request.destroy();
        return;
      }
      chunks.push(buffer);
    }
    try {
      const payload = parseGsiPayload(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      if (payload.auth?.token && payload.auth.token !== this.token) {
        response.writeHead(401).end();
        return;
      }
      this.onPayload?.(payload);
      response.writeHead(204).end();
    } catch {
      response.writeHead(400).end();
    }
  }

  private async loadToken(): Promise<string> {
    try {
      const token = (await fs.readFile(this.statePath, 'utf8')).trim();
      if (/^[a-f0-9]{64}$/.test(token)) return token;
    } catch {
      await fs.mkdir(dirname(this.statePath), { recursive: true });
    }
    const token = randomBytes(32).toString('hex');
    await fs.mkdir(dirname(this.statePath), { recursive: true });
    await fs.writeFile(this.statePath, token, { encoding: 'utf8', mode: 0o600 });
    return token;
  }

  private async installConfig(): Promise<{ installed: boolean; configPath: string | null }> {
    const roots = await steamRoots();
    for (const root of roots) {
      try {
        const dotaRoot = join(root, 'steamapps', 'common', 'dota 2 beta', 'game', 'dota');
        if (!await pathExists(dotaRoot)) continue;
        const configPath = join(dotaRoot, 'cfg', 'gamestate_integration', cfgName);
        const config = `"Counterpick"\n{\n  "uri" "http://127.0.0.1:${this.activePort}/gsi/${this.token}"\n  "timeout" "5.0"\n  "buffer" "0.1"\n  "throttle" "1.0"\n  "heartbeat" "10.0"\n  "auth"\n  {\n    "token" "${this.token}"\n  }\n  "data"\n  {\n    "map" "1"\n    "player" "1"\n  }\n}\n`;
        await fs.mkdir(dirname(configPath), { recursive: true });
        await fs.writeFile(configPath, config, 'utf8');
        return { installed: true, configPath };
      } catch {
        continue;
      }
    }
    return { installed: false, configPath: null };
  }
}
