/**
 * Limits for every external tool the worker shells out to (ffmpeg, pdftoppm,
 * tesseract).
 *
 * Both fields matter. Node's default `maxBuffer` is 1 MB and chatty tools such
 * as ffmpeg exceed that on stderr alone, which kills the child with
 * ERR_CHILD_PROCESS_STDIO_MAXBUFFER partway through otherwise valid work. The
 * default `timeout` is 0 — no timeout at all — so a tool that hangs on a
 * malformed file occupies its worker forever; because the media worker runs at
 * concurrency 1, that stalls every later job in the queue and blocks graceful
 * shutdown. SIGKILL rather than the default SIGTERM because a wedged decoder is
 * exactly the case that ignores a polite signal.
 */
export const EXEC_LIMITS = {
  maxBuffer: 64 * 1024 * 1024,
  timeout: 10 * 60 * 1000,
  killSignal: "SIGKILL",
} as const;
