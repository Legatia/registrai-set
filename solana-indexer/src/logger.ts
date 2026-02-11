const timestamp = (): string => {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `[${hh}:${mm}:${ss}]`;
};

export const log = {
  info: (...args: unknown[]) => console.log(timestamp(), "SATI ", ...args),
  warn: (...args: unknown[]) => console.warn(timestamp(), "WARN ", ...args),
  error: (...args: unknown[]) => console.error(timestamp(), "ERROR", ...args),
};
