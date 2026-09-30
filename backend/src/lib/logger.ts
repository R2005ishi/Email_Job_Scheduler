type Level = 'info' | 'warn' | 'error' | 'debug';

function log(level: Level, scope: string, msg: string, meta?: unknown) {
  const line = `${new Date().toISOString()} [${level.toUpperCase()}] [${scope}] ${msg}`;
  const out = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (meta !== undefined) out(line, meta);
  else out(line);
}

export const createLogger = (scope: string) => ({
  info: (msg: string, meta?: unknown) => log('info', scope, msg, meta),
  warn: (msg: string, meta?: unknown) => log('warn', scope, msg, meta),
  error: (msg: string, meta?: unknown) => log('error', scope, msg, meta),
  debug: (msg: string, meta?: unknown) => {
    if (process.env.DEBUG) log('debug', scope, msg, meta);
  },
});
