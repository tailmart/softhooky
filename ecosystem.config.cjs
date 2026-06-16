/**
 * PM2 生态配置文件
 */
module.exports = {
  apps: [
    {
      name: "softhooky",
      script: "./server.cjs",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3001,
      },
      max_memory_restart: "2G",
      error_file: "./logs/softhooky-error.log",
      out_file: "./logs/softhooky-out.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
