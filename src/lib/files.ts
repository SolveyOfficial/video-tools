/** Formats a byte count for people, e.g. "1.2 MB". */
export const formatBytes = (bytes: number) => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

/** Above this size the browser may run out of memory. */
export const LARGE_FILE = 500 * 1024 * 1024;

export const isVideo = (file: Pick<File, "name" | "type">) =>
  file.type.startsWith("video/") ||
  /\.(mp4|m4v|mov|webm|mkv|avi|wmv|flv|3gp|3g2|mpe?g|ts|mts|m2ts|ogv)$/i.test(file.name);

/** Saves bytes as a file in the user's downloads. */
export const download = (data: Uint8Array | Blob, name: string, type: string) => {
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};
