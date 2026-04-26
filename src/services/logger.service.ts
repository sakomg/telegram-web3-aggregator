type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function normalizeLogLevel(value?: string): LogLevel {
  const lower = (value ?? '').toLowerCase();
  if (lower === 'debug' || lower === 'info' || lower === 'warn' || lower === 'error') {
    return lower;
  }

  return 'info';
}

function formatMeta(meta?: unknown): string {
  if (meta === undefined) {
    return '';
  }

  if (meta instanceof Error) {
    return ` | ${meta.stack ?? meta.message}`;
  }

  if (typeof meta === 'string') {
    return ` | ${meta}`;
  }

  try {
    return ` | ${JSON.stringify(meta)}`;
  } catch {
    return ' | [unserializable-meta]';
  }
}

export class Logger {
  private readonly scope: string;
  private readonly minLogLevel: LogLevel;

  constructor(scope: string, minLogLevel: LogLevel = normalizeLogLevel(process.env.LOG_LEVEL)) {
    this.scope = scope;
    this.minLogLevel = minLogLevel;
  }

  child(scope: string): Logger {
    return new Logger(`${this.scope}:${scope}`, this.minLogLevel);
  }

  debug(message: string, meta?: unknown) {
    this.log('debug', message, meta);
  }

  info(message: string, meta?: unknown) {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: unknown) {
    this.log('warn', message, meta);
  }

  error(message: string, meta?: unknown) {
    this.log('error', message, meta);
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[this.minLogLevel];
  }

  private log(level: LogLevel, message: string, meta?: unknown) {
    if (!this.shouldLog(level)) {
      return;
    }

    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] [${level.toUpperCase()}] [${this.scope}] ${message}${formatMeta(meta)}`;

    if (level === 'error') {
      console.error(line);
      return;
    }

    if (level === 'warn') {
      console.warn(line);
      return;
    }

    console.log(line);
  }
}
