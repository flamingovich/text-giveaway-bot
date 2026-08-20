module.exports = {
  apps: [
    {
      name: "giveaway-bot",
      cwd: "/opt/giveaway-bot",
      script: "src/index.js",
      instances: 1,
      autorestart: true,
      time: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "support-bot",
      cwd: "/opt/giveaway-bot",
      script: "src/support-bot.js",
      instances: 1,
      autorestart: true,
      time: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      max_memory_restart: "256M",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "depman-support-bot",
      cwd: "/opt/giveaway-bot",
      script: "src/depman-support-bot.js",
      instances: 1,
      autorestart: true,
      time: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      max_memory_restart: "256M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
