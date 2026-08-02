export const WIN32_MOD_ALT = 0x0001;
export const WIN32_MOD_CONTROL = 0x0002;
export const WIN32_MOD_SHIFT = 0x0004;
export const WIN32_MOD_WIN = 0x0008;

export type Win32ResolvedHotkey = {
  modifiers: number;
  virtualKey: number;
};

const virtualKeys = new Map<string, number>([
  ['Space', 0x20],
  ['Tab', 0x09],
  ['Capslock', 0x14],
  ['Numlock', 0x90],
  ['Scrolllock', 0x91],
  ['Backspace', 0x08],
  ['Delete', 0x2e],
  ['Insert', 0x2d],
  ['Return', 0x0d],
  ['Up', 0x26],
  ['Down', 0x28],
  ['Left', 0x25],
  ['Right', 0x27],
  ['Home', 0x24],
  ['End', 0x23],
  ['PageUp', 0x21],
  ['PageDown', 0x22],
  ['Escape', 0x1b],
  ['VolumeUp', 0xaf],
  ['VolumeDown', 0xae],
  ['VolumeMute', 0xad],
  ['MediaNextTrack', 0xb0],
  ['MediaPreviousTrack', 0xb1],
  ['MediaStop', 0xb2],
  ['MediaPlayPause', 0xb3],
  ['PrintScreen', 0x2c],
  ['num0', 0x60],
  ['num1', 0x61],
  ['num2', 0x62],
  ['num3', 0x63],
  ['num4', 0x64],
  ['num5', 0x65],
  ['num6', 0x66],
  ['num7', 0x67],
  ['num8', 0x68],
  ['num9', 0x69],
  ['numdec', 0x6e],
  ['numadd', 0x6b],
  ['numsub', 0x6d],
  ['nummult', 0x6a],
  ['numdiv', 0x6f],
]);

const punctuationKeys = new Map<string, Win32ResolvedHotkey>([
  ['!', { modifiers: WIN32_MOD_SHIFT, virtualKey: 0x31 }],
  ['"', { modifiers: WIN32_MOD_SHIFT, virtualKey: 0xde }],
  ['@', { modifiers: WIN32_MOD_SHIFT, virtualKey: 0x32 }],
  ['#', { modifiers: WIN32_MOD_SHIFT, virtualKey: 0x33 }],
  ['$', { modifiers: WIN32_MOD_SHIFT, virtualKey: 0x34 }],
  ['%', { modifiers: WIN32_MOD_SHIFT, virtualKey: 0x35 }],
  ['^', { modifiers: WIN32_MOD_SHIFT, virtualKey: 0x36 }],
  ['&', { modifiers: WIN32_MOD_SHIFT, virtualKey: 0x37 }],
  ['*', { modifiers: WIN32_MOD_SHIFT, virtualKey: 0x38 }],
  ['(', { modifiers: WIN32_MOD_SHIFT, virtualKey: 0x39 }],
  [')', { modifiers: WIN32_MOD_SHIFT, virtualKey: 0x30 }],
  [':', { modifiers: WIN32_MOD_SHIFT, virtualKey: 0xba }],
  [';', { modifiers: 0, virtualKey: 0xba }],
  ['+', { modifiers: WIN32_MOD_SHIFT, virtualKey: 0xbb }],
  ['=', { modifiers: 0, virtualKey: 0xbb }],
  ['<', { modifiers: WIN32_MOD_SHIFT, virtualKey: 0xbc }],
  [',', { modifiers: 0, virtualKey: 0xbc }],
  ['_', { modifiers: WIN32_MOD_SHIFT, virtualKey: 0xbd }],
  ['-', { modifiers: 0, virtualKey: 0xbd }],
  ['>', { modifiers: WIN32_MOD_SHIFT, virtualKey: 0xbe }],
  ['.', { modifiers: 0, virtualKey: 0xbe }],
  ['?', { modifiers: WIN32_MOD_SHIFT, virtualKey: 0xbf }],
  ['/', { modifiers: 0, virtualKey: 0xbf }],
  ['~', { modifiers: WIN32_MOD_SHIFT, virtualKey: 0xc0 }],
  ['`', { modifiers: 0, virtualKey: 0xc0 }],
  ['{', { modifiers: WIN32_MOD_SHIFT, virtualKey: 0xdb }],
  ['[', { modifiers: 0, virtualKey: 0xdb }],
  ['|', { modifiers: WIN32_MOD_SHIFT, virtualKey: 0xdc }],
  ['\\', { modifiers: 0, virtualKey: 0xdc }],
  ['}', { modifiers: WIN32_MOD_SHIFT, virtualKey: 0xdd }],
  [']', { modifiers: 0, virtualKey: 0xdd }],
]);

export function resolveWin32Accelerator(shortcut: string): Win32ResolvedHotkey | null {
  const parts = shortcut.split('+');
  const key = parts.at(-1);
  if (!key) return null;
  let modifiers = 0;
  for (const modifier of parts.slice(0, -1)) {
    if (modifier === 'CommandOrControl' || modifier === 'Control') {
      modifiers |= WIN32_MOD_CONTROL;
    } else if (modifier === 'Alt') {
      modifiers |= WIN32_MOD_ALT;
    } else if (modifier === 'AltGr') {
      modifiers |= WIN32_MOD_CONTROL | WIN32_MOD_ALT;
    } else if (modifier === 'Shift') {
      modifiers |= WIN32_MOD_SHIFT;
    } else if (modifier === 'Super') {
      modifiers |= WIN32_MOD_WIN;
    } else {
      return null;
    }
  }

  if (/^[A-Z0-9]$/.test(key)) {
    return { modifiers, virtualKey: key.charCodeAt(0) };
  }
  const functionKey = /^F([1-9]|1\d|2[0-4])$/.exec(key);
  if (functionKey) {
    return { modifiers, virtualKey: 0x6f + Number(functionKey[1]) };
  }
  const namedKey = virtualKeys.get(key);
  if (namedKey !== undefined) return { modifiers, virtualKey: namedKey };
  const character = key === 'Plus' ? '+' : key;
  const punctuation = punctuationKeys.get(character);
  if (!punctuation) return null;
  return {
    modifiers: modifiers | punctuation.modifiers,
    virtualKey: punctuation.virtualKey,
  };
}
