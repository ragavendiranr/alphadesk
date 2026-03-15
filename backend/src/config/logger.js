'use strict';
const winston = require('winston');

const maskSecrets = winston.format((info) => {
  const s = JSON.stringify(info.message || '');
  info.message = s
    .replace(/api[_-]?key["\s:=]+[\w-]{8,}/gi, 'API_KEY=***')
    .replace(/secret["\s:=]+[\w-]{8,}/gi, 'SECRET=***')
    .replace(/password["\s:=]+\S+/gi, 'PASSWORD=***')
    .replace(/token["\s:=]+[\w.-]{20,}/gi, 'TOKEN=***');
  return info;
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    maskSecrets(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, module: mod }) =>
          `${timestamp} [${mod || 'app'}] ${level}: ${message}`
        )
      ),
    }),
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 10,
    }),
  ],
});

module.exports = logger;
