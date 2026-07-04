import '@testing-library/jest-dom';

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
