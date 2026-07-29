/** Parsed HTTP Content-Range header ("bytes start-end/total"). */
export interface ContentRange {
  start: number;
  end: number;
  total: number;
}

export function parseContentRange(header: string): ContentRange | null {
  const match = header.match(/bytes (\d+)-(\d+)\/(\d+)/);
  if (!match) return null;
  return { start: Number(match[1]), end: Number(match[2]), total: Number(match[3]) };
}
