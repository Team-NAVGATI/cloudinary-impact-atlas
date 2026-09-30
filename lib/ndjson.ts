/** Read a newline-delimited JSON response incrementally and call `onEvent` for every complete line. */
export async function readNdjson<T = unknown>(res: Response, onEvent: (event: T) => void): Promise<void> {
  if (!res.body) throw new Error('The server sent no data');
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        onEvent(JSON.parse(line) as T);
      } catch {
        /* ignore a malformed line rather than breaking the whole stream */
      }
    }
  }
  const tail = buf.trim();
  if (tail) {
    try {
      onEvent(JSON.parse(tail) as T);
    } catch {
      /* ignore */
    }
  }
}
