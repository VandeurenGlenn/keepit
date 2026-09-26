const { resolve } = require('node:path')

const applicationRoot = resolve(__dirname, '..')

module.exports = {
  apps: [
    {
      name: 'keepit',
      cwd: applicationRoot,
      script: './scripts/start-server.mjs',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
      env: {
        NODE_ENV: 'production',
        PORT: 5678
      }
    }
  ]
}
