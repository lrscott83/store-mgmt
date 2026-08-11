import '@testing-library/jest-dom';
import { afterEach } from 'vitest';
import { installHttpBlocker, isReportingSuppressed } from './app/shared/lib/testing/block-real-http';

// No unit test may reach the network. See block-real-http.ts for why a silent
// real request is worse than a failing one: the app catches its own network
// errors, so an unmocked request does not fail the test that made it — it
// lands later, in a different file, as a session that logged itself out.
//
// Draining the recording here (rather than only throwing at call time) is what
// makes that visible: the attempt is reported even when application code
// swallowed the error it raised.
const httpBlocker = installHttpBlocker();

afterEach(() => {
  const attempts = httpBlocker.takeAttempts();
  if (attempts.length > 0 && !isReportingSuppressed()) {
    throw new Error(
      `This test made ${attempts.length} unmocked HTTP request(s):\n` +
        attempts.map((attempt) => `  - ${attempt}`).join('\n') +
        "\nMock the module that issues them — see app/shared/lib/testing/block-real-http.ts."
    );
  }
});

// jsdom's Blob implementation is minimal (no `.arrayBuffer()`/`.text()` —
// see https://github.com/jsdom/jsdom/issues/2555). Real browsers implement
// the full Blob spec. Rather than swap the global Blob/File classes (which
// breaks jsdom's FileReader, since it type-checks against its own Blob
// class internally), polyfill the missing methods on jsdom's own
// Blob.prototype using jsdom's own (working) FileReader.
// Needed for @zip.js/zip.js (sync export/import), which relies on these.
if (typeof Blob !== 'undefined' && typeof Blob.prototype.arrayBuffer !== 'function') {
  Blob.prototype.arrayBuffer = function polyfillArrayBuffer(this: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error ?? new Error('Blob.arrayBuffer() failed'));
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.readAsArrayBuffer(this);
    });
  };
}

if (typeof Blob !== 'undefined' && typeof Blob.prototype.text !== 'function') {
  Blob.prototype.text = function polyfillText(this: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error ?? new Error('Blob.text() failed'));
      reader.onload = () => resolve(reader.result as string);
      reader.readAsText(this);
    });
  };
}
