require('dotenv').config();
const axios = require('axios');
const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({
    host: process.env.DB_HOST, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
    waitForConnections: true, connectionLimit: 1
  });
  const apiKey = process.env.VIDEO_GEN_API_KEY || process.env.IMAGE_GEN_API_KEY_1;
  const genRes = await axios.get('https://api.xgapi.top/v1/video/generations/task_coC1kiAyC0adj3hjsSxgyR2VXtqMJjzE', {
    headers: { Authorization: 'Bearer ' + apiKey }, timeout: 10000
  });
  const genData = genRes.data;
  const realUrl = genData.data.data[0].url;
  console.log('真实URL:', realUrl);
  if (realUrl && !realUrl.includes('/content')) {
    await pool.execute('UPDATE generated_images SET image_url = ? WHERE id = 1453', [realUrl]);
    console.log('✅ DB updated:', realUrl);
  }
  await pool.end();
})();
