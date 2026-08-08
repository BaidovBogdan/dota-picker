import { promises as fs } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { PAIRING_SCHEME } from '../src/protocol.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'dist');
const source = resolve(root, 'src');
const relativeOutput = relative(root, output);
if (!relativeOutput || relativeOutput.startsWith('..')) throw new Error('Invalid build output path');

const packageJson = JSON.parse(await fs.readFile(join(root, 'package.json'), 'utf8'));
const iconSource = resolve(root, '..', '..', 'client', 'assets', 'brand', 'counterpick-icon.png');

function createIco(images) {
  const directory = Buffer.alloc(6 + images.length * 16);
  directory.writeUInt16LE(0, 0);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(images.length, 4);
  let offset = directory.length;
  images.forEach(({ size, data }, index) => {
    const entry = 6 + index * 16;
    directory.writeUInt8(size === 256 ? 0 : size, entry);
    directory.writeUInt8(size === 256 ? 0 : size, entry + 1);
    directory.writeUInt8(0, entry + 2);
    directory.writeUInt8(0, entry + 3);
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(data.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([directory, ...images.map(({ data }) => data)]);
}

async function createPng(size, grayscale = false) {
  let pipeline = sharp(iconSource).resize(size, size, { fit: 'cover' });
  if (grayscale) pipeline = pipeline.grayscale();
  return pipeline.png({ compressionLevel: 9, effort: 10, palette: true, colors: 128 }).toBuffer();
}

const manifest = {
  manifest_version: 1,
  type: 'WebApp',
  meta: {
    name: 'Counterpick Live',
    author: 'Counterpick',
    version: packageJson.version,
    'minimum-overwolf-version': '0.236.0',
    description: 'Exact live Dota 2 draft data for the Counterpick desktop assistant.',
    icon: 'assets/icon.png',
    icon_gray: 'assets/icon-gray.png',
    launcher_icon: 'assets/launcher.ico',
    window_icon: 'assets/icon.png',
    dock_button_title: 'Counterpick Live',
  },
  permissions: ['GameInfo'],
  data: {
    start_window: 'background',
    game_targeting: {
      type: 'dedicated',
      game_ids: [7314],
    },
    game_events: [7314],
    launch_events: [
      {
        event: 'GameLaunch',
        event_data: { game_ids: [7314] },
        start_minimized: true,
      },
    ],
    url_protocol: {
      schemes: [PAIRING_SCHEME],
    },
    windows: {
      background: {
        file: 'background.html',
        is_background_page: true,
        background_optimization: false,
        block_top_window_navigation: true,
      },
      status: {
        file: 'main.html',
        desktop_only: true,
        transparent: false,
        resizable: false,
        show_in_taskbar: true,
        block_top_window_navigation: true,
        size: { width: 460, height: 620 },
        min_size: { width: 460, height: 620 },
        max_size: { width: 460, height: 620 },
      },
    },
  },
};

await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(join(output, 'assets'), { recursive: true });
await Promise.all([
  fs.copyFile(join(source, 'background.html'), join(output, 'background.html')),
  fs.copyFile(join(source, 'main.html'), join(output, 'main.html')),
  fs.copyFile(join(source, 'main.css'), join(output, 'main.css')),
  fs.copyFile(join(source, 'main.js'), join(output, 'main.js')),
  fs.copyFile(join(source, 'protocol.js'), join(output, 'protocol.js')),
]);
const [icon, grayIcon, ...icoFrames] = await Promise.all([
  createPng(256),
  createPng(256, true),
  ...[16, 32, 48, 256].map(async (size) => ({ size, data: await createPng(size) })),
]);
if (icon.length > 30 * 1024 || grayIcon.length > 30 * 1024) {
  throw new Error('Overwolf dock icons must be smaller than 30KB');
}
await Promise.all([
  fs.writeFile(join(output, 'assets', 'icon.png'), icon),
  fs.writeFile(join(output, 'assets', 'icon-gray.png'), grayIcon),
  fs.writeFile(join(output, 'assets', 'launcher.ico'), createIco(icoFrames)),
]);
await fs.writeFile(join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
