// Hands the viewer a file to save (exports). DOM only; no network.

/** Saves `text` as `name` through a temporary object URL. */
export function download(name: string, mime: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
