import { GlobalWindow } from 'happy-dom';

const win = new GlobalWindow();
for (const key of Object.getOwnPropertyNames(win)) {
  if (!(key in globalThis)) {
    // @ts-expect-error dynamic property assign
    globalThis[key] = win[key];
  }
}
// @ts-expect-error window assignment
globalThis.window = win;
// @ts-expect-error document assignment
globalThis.document = win.document;
// @ts-expect-error navigator assignment
globalThis.navigator = win.navigator;

import { afterEach } from 'bun:test';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
