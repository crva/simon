import pino from "pino";

const isDevelopment = process.env.NODE_ENV === "development";

const logger = isDevelopment
  ? pino({
      level: process.env.LOG_LEVEL || "debug",
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss",
          ignore: "pid,hostname",
          singleLine: false,
        },
      },
    })
  : pino({
      level: process.env.LOG_LEVEL || "info",
    });

export { logger };
