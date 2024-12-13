export const logger = {
  info: (message: string, meta?: Record<string, any>) => {
    console.log(message, meta ? meta : '');
  },
  error: (message: string, meta?: Record<string, any>) => {
    console.error(message, meta ? meta : '');
  },
  warn: (message: string, meta?: Record<string, any>) => {
    console.warn(message, meta ? meta : '');
  },
  debug: (message: string, meta?: Record<string, any>) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug(message, meta ? meta : '');
    }
  }
};
