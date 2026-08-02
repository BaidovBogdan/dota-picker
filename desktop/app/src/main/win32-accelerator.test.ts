import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  resolveWin32Accelerator,
  WIN32_MOD_ALT,
  WIN32_MOD_CONTROL,
  WIN32_MOD_SHIFT,
  WIN32_MOD_WIN,
} from './win32-accelerator.ts';

describe('resolveWin32Accelerator', () => {
  it('maps PageUp without introducing modifiers', () => {
    assert.deepEqual(resolveWin32Accelerator('PageUp'), {
      modifiers: 0,
      virtualKey: 0x21,
    });
  });

  it('maps combinations and function keys', () => {
    assert.deepEqual(resolveWin32Accelerator('CommandOrControl+Shift+F24'), {
      modifiers: WIN32_MOD_CONTROL | WIN32_MOD_SHIFT,
      virtualKey: 0x87,
    });
  });

  it('maps AltGr and Windows modifiers explicitly', () => {
    assert.deepEqual(resolveWin32Accelerator('AltGr+Super+num7'), {
      modifiers: WIN32_MOD_CONTROL | WIN32_MOD_ALT | WIN32_MOD_WIN,
      virtualKey: 0x67,
    });
  });

  it('maps punctuation independently from the active keyboard layout', () => {
    assert.deepEqual(resolveWin32Accelerator('Control+?'), {
      modifiers: WIN32_MOD_CONTROL | WIN32_MOD_SHIFT,
      virtualKey: 0xbf,
    });
    assert.deepEqual(resolveWin32Accelerator('Plus'), {
      modifiers: WIN32_MOD_SHIFT,
      virtualKey: 0xbb,
    });
    assert.deepEqual(resolveWin32Accelerator(';'), {
      modifiers: 0,
      virtualKey: 0xba,
    });
  });

  it('covers every punctuation token accepted by the shared schema', () => {
    const expected = new Map<string, [number, number]>([
      [')', [WIN32_MOD_SHIFT, 0x30]], ['!', [WIN32_MOD_SHIFT, 0x31]],
      ['@', [WIN32_MOD_SHIFT, 0x32]], ['#', [WIN32_MOD_SHIFT, 0x33]],
      ['$', [WIN32_MOD_SHIFT, 0x34]], ['%', [WIN32_MOD_SHIFT, 0x35]],
      ['^', [WIN32_MOD_SHIFT, 0x36]], ['&', [WIN32_MOD_SHIFT, 0x37]],
      ['*', [WIN32_MOD_SHIFT, 0x38]], ['(', [WIN32_MOD_SHIFT, 0x39]],
      [':', [WIN32_MOD_SHIFT, 0xba]], [';', [0, 0xba]],
      ['=', [0, 0xbb]], ['<', [WIN32_MOD_SHIFT, 0xbc]], [',', [0, 0xbc]],
      ['_', [WIN32_MOD_SHIFT, 0xbd]], ['-', [0, 0xbd]],
      ['>', [WIN32_MOD_SHIFT, 0xbe]], ['.', [0, 0xbe]],
      ['?', [WIN32_MOD_SHIFT, 0xbf]], ['/', [0, 0xbf]],
      ['~', [WIN32_MOD_SHIFT, 0xc0]], ['`', [0, 0xc0]],
      ['{', [WIN32_MOD_SHIFT, 0xdb]], [']', [0, 0xdd]], ['[', [0, 0xdb]],
      ['|', [WIN32_MOD_SHIFT, 0xdc]], ['\\', [0, 0xdc]],
      ['}', [WIN32_MOD_SHIFT, 0xdd]], ['"', [WIN32_MOD_SHIFT, 0xde]],
    ]);
    for (const [token, [modifiers, virtualKey]] of expected) {
      assert.deepEqual(resolveWin32Accelerator(token), { modifiers, virtualKey }, token);
    }
  });

  it('rejects unsupported and unmappable accelerators', () => {
    assert.equal(resolveWin32Accelerator('Command+P'), null);
    assert.equal(resolveWin32Accelerator('UnknownKey'), null);
  });
});
