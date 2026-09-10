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
// @ts-expect-error event alignment for happy-dom dispatchEvent
globalThis.Event = win.Event;
// @ts-expect-error event alignment for happy-dom dispatchEvent
globalThis.CustomEvent = win.CustomEvent;

import { afterEach } from 'bun:test';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
