module.exports = {
  apps: [
    {
      name: 'chirashi-app',
      script: 'npx',
      args: 'wrangler pages dev dist --d1=chirashi-db --local --ip 0.0.0.0 --port 3000',
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork'
    },
    {
      name: 'chirashi-ai',
      script: './ai-proxy.mjs',
      interpreter: 'node',
      env: {
        NODE_ENV: 'development',
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork'
    }
  ]
}
