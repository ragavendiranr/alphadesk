// PM2 ecosystem config — production
module.exports = {
  apps: [
    {
      name:               'alphadesk-api',
      script:             'backend/server.js',
      cwd:                __dirname,
      env_file:           '.env',
      instances:          1,
      exec_mode:          'fork',
      watch:              false,
      autorestart:        true,
      max_restarts:       20,
      restart_delay:      3000,          // 3 s between restarts
      max_memory_restart: '300M',        // restart if RSS exceeds 300 MB
      error_file:         './logs/err.log',
      out_file:           './logs/out.log',
      merge_logs:         true,
      log_date_format:    'YYYY-MM-DD HH:mm:ss Z',
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name:        'alphadesk-ml',
      script:      'ml-engine/venv/bin/uvicorn',
      args:        'main:app --host 0.0.0.0 --port 5001',
      cwd:         `${__dirname}/ml-engine`,
      interpreter: 'none',
      env_file:    '../.env',
      watch:       false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      max_memory_restart: '300M',
      error_file:  '../logs/err.log',
      out_file:    '../logs/out.log',
      merge_logs:  true,
    },
  ],
};
