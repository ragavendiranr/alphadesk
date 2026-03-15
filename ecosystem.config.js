// PM2 ecosystem config for production
module.exports = {
  apps: [
    {
      name:    'alphadesk-api',
      script:  'backend/server.js',
      cwd:     __dirname,
      env_file: '.env',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_restarts: 10,
      restart_delay: 5000,
      error_file:  'logs/api-error.log',
      out_file:    'logs/api-out.log',
    },
    {
      name:        'alphadesk-ml',
      script:      'ml-engine/venv/bin/uvicorn',
      args:        'main:app --host 0.0.0.0 --port 5001',
      cwd:         `${__dirname}/ml-engine`,
      interpreter: 'none',
      env_file:    '../.env',
      watch: false,
      max_restarts: 5,
      error_file:  '../logs/ml-error.log',
      out_file:    '../logs/ml-out.log',
    },
  ],
};
