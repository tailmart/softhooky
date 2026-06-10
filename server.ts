import express from "express";
import compression from "compression";
import axios from "axios";
import dotenv from "dotenv";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { userDb, sessionDb, creditTransactionDb, generatedImagesDb, bannerCarouselDb, hashPassword, verifyPassword, generateToken, subUserDb, withRetry, isDbConnected, creditBucketDb, agentDb, commissionDb, withdrawDb, inviteCodeDb } from "./src/server/db";
import { pool } from "./src/server/db";
import FormData from "form-data";
import nodemailer from "nodemailer";
import crypto from "crypto";
import { startCleanupScheduler } from "./src/server/cleanup-expired-images";
import { splitImageElements } from "./src/server/imageSplitter";

// 全局错误处理：防止未捕获的异步错误导致进程崩溃
process.on('unhandledRejection', (reason) => {
  console.error('⚠️ 未捕获的 Promise 拒绝:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('⚠️ 未捕获的异常:', err);
});

dotenv.config({ path: './.env' });

const SERVER_START_TIME = Date.now();

// COS S3 客户端单例（避免每次请求重复创建连接）
const cosClient = new S3Client({
  region: process.env.COS_REGION || 'ap-beijing',
  endpoint: 'https://cos.ap-beijing.myqcloud.com',
  credentials: {
    accessKeyId: process.env.COS_SECRET_ID!,
    secretAccessKey: process.env.COS_SECRET_KEY!,
  },
});

const app = express();

// ==================== 安全保护 ====================

// IP 限流：存储每个 IP 的请求时间戳
const ipRequestLog: Map<string, number[]> = new Map();
// IP 登录失败次数
const ipLoginFailures: Map<string, { count: number; lockedUntil: number }> = new Map();

// 清除过期的 IP 记录（每分钟清理一次）
setInterval(() => {
  const now = Date.now();
  const ONE_HOUR = 60 * 60 * 1000;
  const FIVE_MINUTES = 5 * 60 * 1000;

  // 清理请求日志
  for (const [ip, timestamps] of ipRequestLog.entries()) {
    const valid = timestamps.filter(t => now - t < ONE_HOUR);
    if (valid.length === 0) {
      ipRequestLog.delete(ip);
    } else {
      ipRequestLog.set(ip, valid);
    }
  }

  // 清理登录失败记录
  for (const [ip, data] of ipLoginFailures.entries()) {
    if (now > data.lockedUntil + ONE_HOUR) {
      ipLoginFailures.delete(ip);
    }
  }
}, 60000);

// 获取客户端 IP
function getClientIP(req: express.Request): string {
  return req.headers['x-forwarded-for']?.toString().split(',')[0].trim() ||
         req.headers['x-real-ip']?.toString() ||
         req.socket.remoteAddress ||
         'unknown';
}

// 检查 IP 是否被锁定（登录失败过多）
function isIPLocked(ip: string): { locked: boolean; reason: string } {
  const data = ipLoginFailures.get(ip);
  if (!data) return { locked: false, reason: '' };

  if (Date.now() < data.lockedUntil) {
    const minutesLeft = Math.ceil((data.lockedUntil - Date.now()) / 60000);
    return { locked: true, reason: `IP已被锁定，请${minutesLeft}分钟后再试` };
  }

  // 锁定已过期，清除记录
  ipLoginFailures.delete(ip);
  return { locked: false, reason: '' };
}

// IP 请求限流检查（通用认证端点）
function checkRateLimit(ip: string, endpoint: string, maxRequests: number, windowMs: number): { limited: boolean; message: string } {
  const now = Date.now();
  const key = `${ip}:${endpoint}`;

  if (!ipRequestLog.has(key)) {
    ipRequestLog.set(key, []);
  }

  const timestamps = ipRequestLog.get(key)!;
  const validTimestamps = timestamps.filter(t => now - t < windowMs);

  if (validTimestamps.length >= maxRequests) {
    const secondsLeft = Math.ceil((validTimestamps[0] + windowMs - now) / 1000);
    return { limited: true, message: `请求过于频繁，请${secondsLeft}秒后再试` };
  }

  validTimestamps.push(now);
  ipRequestLog.set(key, validTimestamps);
  return { limited: false, message: '' };
}

// 记录登录失败（按 IP）
function recordIPLoginFailure(ip: string): number {
  const data = ipLoginFailures.get(ip);
  const count = data ? data.count + 1 : 1;
  const lockedUntil = count >= 10 ? Date.now() + 30 * 60 * 1000 : 0; // 10次失败后锁定30分钟
  ipLoginFailures.set(ip, { count, lockedUntil });
  return count;
}

// 清除 IP 登录失败记录
function clearIPLoginFailure(ip: string): void {
  ipLoginFailures.delete(ip);
}

// 价格配置缓存
let pricingCache: Map<string, { price: number; enabled: boolean }> = new Map();
let pricingCacheTime = 0;
const PRICING_CACHE_TTL = 60000; // 1分钟缓存

// 获取价格配置（带缓存）
async function getPricing(key: string): Promise<number> {
  const now = Date.now();
  if (now - pricingCacheTime > PRICING_CACHE_TTL || !pricingCache.has(key)) {
    try {
      const [rows]: any = await pool.execute(
        'SELECT price, enabled FROM pricing_config WHERE `key` = ?',
        [key]
      );
      if (rows && rows.length > 0) {
        pricingCache.set(key, { price: parseFloat(rows[0].price), enabled: rows[0].enabled === 1 });
      }
      pricingCacheTime = now;
    } catch (err) {
      console.error('获取价格配置失败:', err);
    }
  }
  return pricingCache.get(key)?.price || 0.3; // 默认 0.3
}

// 获取用户实际扣费价格（考虑上级代理的自定义定价覆盖）
async function getUserEffectivePricing(userId: number, pricingKey: string): Promise<number> {
  const defaultPrice = await getPricing(pricingKey);
  try {
    const [users] = await pool.execute('SELECT invited_by FROM users WHERE id = ?', [userId]);
    const user = (users as any[])[0];
    if (user?.invited_by) {
      const agentPricing = await agentDb.getPricing(user.invited_by);
      if (agentPricing[pricingKey] && agentPricing[pricingKey] > 0) {
        console.log(`🏷️ Agent pricing override: ${pricingKey} ${defaultPrice} -> ${agentPricing[pricingKey]} (agent: ${user.invited_by})`);
        return agentPricing[pricingKey];
      }
    }
  } catch (err) {
    console.error('获取代理定价失败:', err);
  }
  return defaultPrice;
}

// 清除价格缓存
function clearPricingCache() {
  pricingCacheTime = 0;
  pricingCache.clear();
}

// 代理消费佣金处理（给上级代理分成）
// 佣金 = (代理定价 - 官方定价) × 数量
// 不传 pricingKey 则跳过（无法计算）
async function handleConsumptionCommission(consumerId: number, amount: number, source: string = 'consume', pricingKey: string | null = null) {
  try {
    if (!pricingKey) {
      console.log(`ℹ️ 跳过佣金（无pricingKey）: consumerId=${consumerId} amount=${amount}`);
      return;
    }
    const consumer = await userDb.findById(consumerId);
    if (consumer && consumer.invited_by) {
      const agent = await userDb.findById(consumer.invited_by);
      if (agent && agent.is_agent) {
        const basePrice = await getPricing(pricingKey);
        const agentPricing = await agentDb.getPricing(agent.id);
        const agentPrice = agentPricing[pricingKey];

        if (agentPrice && agentPrice > basePrice) {
          // 佣金 = 扣费总额 × (代理价格 - 官方价格) / 代理价格
          const commissionAmount = parseFloat((amount * (agentPrice - basePrice) / agentPrice).toFixed(4));
          if (commissionAmount > 0) {
            await userDb.updateCommissionBalance(agent.id, commissionAmount);
            await commissionDb.create(agent.id, consumerId, commissionAmount, source);
            const sourceLabel = source === 'recharge' ? '充值' : '消费';
            console.log(`💰 代理佣金: ${agent.email} 获得 ${commissionAmount} (来自 ${consumer.email} ${sourceLabel} ${amount}, key=${pricingKey}, base=${basePrice}, agentPrice=${agentPrice})`);
          }
        } else {
          console.log(`ℹ️ 代理无加价: ${agent.email} key=${pricingKey} base=${basePrice} agentPrice=${agentPrice}`);
        }
      }
    }
  } catch (err) {
    console.error(`代理佣金处理失败(source=${source}):`, err);
  }
}

// 站点配置缓存
let siteConfigCache: { logo_url: string; icon_url: string; site_title: string } | null = null;
let siteConfigCacheTime = 0;
const SITE_CONFIG_CACHE_TTL = 60000;

async function getSiteConfig(): Promise<{ logo_url: string; icon_url: string; site_title: string }> {
  const now = Date.now();
  if (!siteConfigCache || now - siteConfigCacheTime > SITE_CONFIG_CACHE_TTL) {
    try {
      const [rows]: any = await pool.execute('SELECT logo_url, icon_url, site_title FROM site_config WHERE id = 1');
      if (rows && rows.length > 0) {
        siteConfigCache = {
          logo_url: rows[0].logo_url || '/logo.png',
          icon_url: rows[0].icon_url || '/logo.png',
          site_title: rows[0].site_title || 'Softhooky-智能设计平台'
        };
      }
      siteConfigCacheTime = now;
    } catch (err) {
      console.error('获取站点配置失败:', err);
    }
  }
  return siteConfigCache || { logo_url: '/logo.png', icon_url: '/logo.png', site_title: 'Softhooky-智能设计平台' };
}

function clearSiteConfigCache() {
  siteConfigCache = null;
  siteConfigCacheTime = 0;
}

// 确保 users 表有 last_login_at 字段（启动时执行一次）
(async () => {
  try {
    await pool.execute(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP NULL DEFAULT NULL
    `);
    console.log('✅ users 表 last_login_at 字段检查完成');
  } catch (error) {
    console.log('ℹ️ last_login_at 字段可能已存在');
  }

  // 添加 is_admin 字段
  try {
    await pool.execute(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS is_admin TINYINT DEFAULT 0
    `);
    console.log('✅ users 表 is_admin 字段检查完成');

    // 设置 softhooky@163.com 为管理员
    try {
      await pool.execute(`
        UPDATE users SET is_admin = 1 WHERE email = 'softhooky@163.com'
      `);
      const [result]: any = await pool.execute(
        'SELECT id FROM users WHERE email = ?',
        ['softhooky@163.com']
      );
      if ((result as any[]).length > 0) {
        console.log('✅ 管理员账号已设置: softhooky@163.com');
      }
    } catch (e) {
      console.log('ℹ️ 设置管理员账号失败或账号不存在');
    }
  } catch (error) {
    console.log('ℹ️ is_admin 字段可能已存在');
  }

  // 创建 notifications 表
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INT PRIMARY KEY AUTO_INCREMENT,
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        is_active TINYINT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统通知表'
    `);
    console.log('✅ notifications 表检查完成');
  } catch (error) {
    console.log('ℹ️ notifications 表可能已存在');
  }

  // 创建 banner_carousels 表 - 存储详情页轮播图历史记录
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS banner_carousels (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        parent_user_id INT NULL,
        product_images JSON NOT NULL COMMENT '产品图片URL数组',
        product_description TEXT NULL COMMENT '用户输入的产品描述',
        analysis_result JSON NULL COMMENT 'AI分析结果',
        generated_images JSON NOT NULL COMMENT '生成的轮播图数组',
        banner_count INT NOT NULL DEFAULT 5,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_created_at (created_at),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='详情页轮播图历史记录表'
    `);
    console.log('✅ banner_carousels 表检查完成');
  } catch (error) {
    console.log('ℹ️ banner_carousels 表可能已存在或创建失败:', error);
  }

  // 创建 deepseek_chat_messages 表 - 存储 Deepseek 对话消息
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS deepseek_chat_messages (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        type ENUM('user', 'ai') NOT NULL COMMENT '消息类型',
        content TEXT NOT NULL COMMENT '消息内容',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_created_at (created_at),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Deepseek对话消息表'
    `);
    console.log('✅ deepseek_chat_messages 表检查完成');
  } catch (error) {
    console.log('ℹ️ deepseek_chat_messages 表可能已存在或创建失败:', error);
  }

  // 给 generated_images 表添加位置字段（迁移）
  try {
    await pool.execute(`
      ALTER TABLE generated_images 
      ADD COLUMN position_x FLOAT NULL COMMENT '图片在画布上的X坐标',
      ADD COLUMN position_y FLOAT NULL COMMENT '图片在画布上的Y坐标'
    `);
    console.log('✅ generated_images 位置字段添加成功');
  } catch (error: any) {
    if (error.message?.includes('Duplicate column')) {
      console.log('ℹ️ 位置字段已存在');
    } else {
      console.log('ℹ️ 位置字段添加失败（可能表已存在字段）:', error.message?.substring(0, 100));
    }
  }

  // 给 generated_images 表的 type 字段添加 chatgen 类型（迁移）
  try {
    await pool.execute(`ALTER TABLE generated_images MODIFY COLUMN type VARCHAR(50) NOT NULL DEFAULT 'generated'`);
    console.log('✅ generated_images type 字段已修改为 VARCHAR，支持 chatgen 类型');
  } catch (error: any) {
    console.log('ℹ️ type 字段修改失败:', error.message?.substring(0, 100));
  }

  // 初始化视频定价（默认值）
  try {
    const defaultPricing: { key: string; name: string; price: number }[] = [
      { key: 'gemini_video_4s', name: 'Gemini Omini 视频 4秒', price: 3 },
      { key: 'gemini_video_8s', name: 'Gemini Omini 视频 8秒', price: 3 },
      { key: 'gemini_video_10s', name: 'Gemini Omini 视频 10秒', price: 3 },
      { key: 'veo31_video', name: 'Veo3.1 视频生成', price: 1 },
      { key: 'veo31_video_fast', name: 'Veo3.1 视频生成(Fast)', price: 1 },
      { key: 'veo31_video_4k', name: 'Veo3.1 视频生成 4K', price: 2 },
      { key: 'veo31_video_fast_4k', name: 'Veo3.1 视频生成(Fast) 4K', price: 2 },
    ];
    for (const p of defaultPricing) {
      await pool.execute(
        'INSERT IGNORE INTO pricing_config (`key`, name, price, enabled) VALUES (?, ?, ?, 1)',
        [p.key, p.name, p.price]
      );
    }
    console.log('✅ 视频定价初始化完成');
  } catch (error) {
    console.log('ℹ️ 视频定价初始化失败:', error);
  }

  // 初始化图片生成定价（默认值）
  try {
    const imagePricing: { key: string; name: string; price: number }[] = [
      { key: 'seedream_generation', name: 'Seedream 文生图', price: 0.2 },
      { key: 'seedream_edit', name: 'Seedream 图生图', price: 0.2 },
    ];
    for (const p of imagePricing) {
      await pool.execute(
        'INSERT IGNORE INTO pricing_config (`key`, name, price, enabled) VALUES (?, ?, ?, 1)',
        [p.key, p.name, p.price]
      );
    }
    console.log('✅ 图片生成定价初始化完成');
  } catch (error) {
    console.log('ℹ️ 图片生成定价初始化失败:', error);
  }

  // 清理已下架的 Sora-2 价格配置
  try {
    const sora2Keys = ['sora2_video_4s', 'sora2_video_8s', 'sora2_video_12s'];
    for (const key of sora2Keys) {
      await pool.execute('DELETE FROM pricing_config WHERE `key` = ?', [key]);
    }
    console.log('✅ 已清理 Sora-2 视频定价配置');
  } catch (error) {
    console.log('ℹ️ Sora-2 视频定价清理失败:', error);
  }

  // 初始化聊天定价（默认值）
  try {
    await pool.execute(
      "INSERT IGNORE INTO pricing_config (`key`, name, price, enabled) VALUES (?, ?, ?, 1)",
      ['deepseek_chat', 'AI文案对话', 0.01]
    );
    console.log('✅ 聊天定价初始化完成');
  } catch (error) {
    console.log('ℹ️ 聊天定价初始化失败:', error);
  }
})();

// 初始化代理系统表
(async () => {
  try {
    await pool.execute('ALTER TABLE users ADD COLUMN invited_by INT NULL');
    console.log('✅ users 表 invited_by 字段添加成功');
  } catch (error: any) {
    if (error.message?.includes('Duplicate column') || error.errno === 1060) {
      console.log('ℹ️ invited_by 字段已存在');
    } else {
      console.log('ℹ️ 添加 invited_by 字段失败:', error.message?.substring(0, 100));
    }
  }
  try {
    await pool.execute('ALTER TABLE users ADD COLUMN commission_balance DECIMAL(10,2) DEFAULT 0');
    console.log('✅ users 表 commission_balance 字段添加成功');
  } catch (error: any) {
    if (error.message?.includes('Duplicate column') || error.errno === 1060) {
      console.log('ℹ️ commission_balance 字段已存在');
    } else {
      console.log('ℹ️ 添加 commission_balance 字段失败:', error.message?.substring(0, 100));
    }
  }
  try {
    await pool.execute('ALTER TABLE users ADD COLUMN is_agent TINYINT DEFAULT 0');
    console.log('✅ users 表 is_agent 字段添加成功');
  } catch (error: any) {
    if (error.message?.includes('Duplicate column') || error.errno === 1060) {
      console.log('ℹ️ is_agent 字段已存在');
    } else {
      console.log('ℹ️ 添加 is_agent 字段失败:', error.message?.substring(0, 100));
    }
  }
  try {
    await pool.execute('ALTER TABLE users ADD COLUMN applied_agent TINYINT DEFAULT 0');
    console.log('✅ users 表 applied_agent 字段添加成功');
  } catch (error: any) {
    if (error.message?.includes('Duplicate column') || error.errno === 1060) {
      console.log('ℹ️ applied_agent 字段已存在');
    } else {
      console.log('ℹ️ 添加 applied_agent 字段失败:', error.message?.substring(0, 100));
    }
  }

  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS agent_pricing (
        agent_id INT NOT NULL,
        service_key VARCHAR(64) NOT NULL,
        price DECIMAL(10,4) NOT NULL,
        PRIMARY KEY (agent_id, service_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='代理自定义定价表'
    `);
    console.log('✅ agent_pricing 表检查完成');
  } catch (error) {
    console.log('ℹ️ agent_pricing 表可能已存在');
  }

  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS commission_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        agent_id INT NOT NULL,
        user_id INT NOT NULL,
        amount DECIMAL(10,2) NOT NULL COMMENT '佣金金额',
        source VARCHAR(32) NOT NULL COMMENT 'consume/recharge',
        order_id VARCHAR(64) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_agent_id (agent_id),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='佣金流水表'
    `);
    console.log('✅ commission_logs 表检查完成');
  } catch (error) {
    console.log('ℹ️ commission_logs 表可能已存在');
  }

  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS withdraw_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        agent_id INT NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        status VARCHAR(16) DEFAULT 'pending' COMMENT 'pending/done/rejected',
        remark TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed_at TIMESTAMP NULL,
        INDEX idx_agent_id (agent_id),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='提现申请表'
    `);
    console.log('✅ withdraw_requests 表检查完成');
  } catch (error) {
    console.log('ℹ️ withdraw_requests 表可能已存在');
  }

  // 加提现账号和凭证字段
  try {
    await pool.execute('ALTER TABLE withdraw_requests ADD COLUMN account_type VARCHAR(16) NULL');
    console.log('✅ withdraw_requests 表 account_type 字段添加成功');
  } catch (error: any) {
    if (error.message?.includes('Duplicate column') || error.errno === 1060) {
      console.log('ℹ️ account_type 字段已存在');
    } else { console.log('ℹ️ 添加 account_type 字段失败:', error.message?.substring(0, 100)); }
  }
  try {
    await pool.execute('ALTER TABLE withdraw_requests ADD COLUMN account_id VARCHAR(255) NULL');
    console.log('✅ withdraw_requests 表 account_id 字段添加成功');
  } catch (error: any) {
    if (error.message?.includes('Duplicate column') || error.errno === 1060) {
      console.log('ℹ️ account_id 字段已存在');
    } else { console.log('ℹ️ 添加 account_id 字段失败:', error.message?.substring(0, 100)); }
  }
  try {
    await pool.execute('ALTER TABLE withdraw_requests ADD COLUMN proof_image_url TEXT NULL');
    console.log('✅ withdraw_requests 表 proof_image_url 字段添加成功');
  } catch (error: any) {
    if (error.message?.includes('Duplicate column') || error.errno === 1060) {
      console.log('ℹ️ proof_image_url 字段已存在');
    } else { console.log('ℹ️ 添加 proof_image_url 字段失败:', error.message?.substring(0, 100)); }
  }
})();

// 初始化站点配置表
(async () => {
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS site_config (
        id INT PRIMARY KEY DEFAULT 1,
        logo_url VARCHAR(500) DEFAULT '/logo.png',
        icon_url VARCHAR(500) DEFAULT '/logo.png',
        site_title VARCHAR(200) DEFAULT 'Softhooky-智能设计平台',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='站点配置'
    `);
    await pool.execute(
      'INSERT IGNORE INTO site_config (id, logo_url, icon_url, site_title) VALUES (1, ?, ?, ?)',
      ['/logo.png', '/logo.png', 'Softhooky-智能设计平台']
    );
    console.log('✅ site_config 表初始化完成');
  } catch (error) {
    console.log('ℹ️ site_config 表可能已存在或创建失败:', error);
  }
})();

// 初始化子账号配额字段
(async () => {
  try {
    await pool.execute(`
      ALTER TABLE users
      ADD COLUMN sub_quota_mode ENUM('shared','allocated') DEFAULT 'shared'
    `);
    console.log('✅ users 表 sub_quota_mode 字段添加成功');
  } catch (error: any) {
    if (error.message?.includes('Duplicate column') || error.errno === 1060) {
      console.log('ℹ️ sub_quota_mode 字段已存在');
    } else {
      console.error('❌ 添加 sub_quota_mode 字段失败:', error.message?.substring(0, 100));
    }
  }

  try {
    await pool.execute(`
      ALTER TABLE sub_users
      ADD COLUMN quota_limit DECIMAL(10,2) DEFAULT 0.00
    `);
    console.log('✅ sub_users 表 quota_limit 字段添加成功');
  } catch (error: any) {
    if (error.message?.includes('Duplicate column') || error.errno === 1060) {
      console.log('ℹ️ quota_limit 字段已存在');
    } else {
      console.error('❌ 添加 quota_limit 字段失败:', error.message?.substring(0, 100));
    }
  }

  try {
    await pool.execute(`
      ALTER TABLE sub_users
      ADD COLUMN quota_consumed DECIMAL(10,2) DEFAULT 0.00
    `);
    console.log('✅ sub_users 表 quota_consumed 字段添加成功');
  } catch (error: any) {
    if (error.message?.includes('Duplicate column') || error.errno === 1060) {
      console.log('ℹ️ quota_consumed 字段已存在');
    } else {
      console.error('❌ 添加 quota_consumed 字段失败:', error.message?.substring(0, 100));
    }
  }
})();

// 初始化 models_config 表（模型管理）
(async () => {
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS models_config (
        id INT AUTO_INCREMENT PRIMARY KEY,
        model_id VARCHAR(100) NOT NULL UNIQUE,
        label VARCHAR(100) NOT NULL,
        enabled TINYINT(1) DEFAULT 1,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    const defaultModels = [
      { model_id: 'seedream', label: 'Seedream', enabled: 1, sort_order: 0 },
      { model_id: 'gpt-image-2', label: 'GPT-Image2', enabled: 1, sort_order: 1 },
      { model_id: 'nanobann2', label: 'Nanobann2', enabled: 1, sort_order: 2 },
    ];
    for (const m of defaultModels) {
      await pool.execute(
        'INSERT INTO models_config (model_id, label, enabled, sort_order) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE sort_order = VALUES(sort_order), label = VALUES(label)',
        [m.model_id, m.label, m.enabled, m.sort_order]
      );
    }
    console.log('✅ models_config 表初始化完成');
  } catch (error) {
    console.log('ℹ️ models_config 表初始化失败:', error);
  }
})();

// 初始化 nav_config 表（导航菜单管理）
(async () => {
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS nav_config (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nav_id VARCHAR(100) NOT NULL UNIQUE,
        label VARCHAR(100) NOT NULL,
        category VARCHAR(100) NOT NULL,
        enabled TINYINT(1) DEFAULT 1,
        sort_order INT DEFAULT 0
      )
    `);
    const defaultNavItems = [
      { nav_id: 'chat-gen', label: '创意生图', category: '素材工作台', sort_order: 0 },
      { nav_id: 'productRefine', label: '产品精修', category: '素材工作台', sort_order: 1 },
      { nav_id: 'productFusion', label: '产品融图', category: '素材工作台', sort_order: 2 },
      { nav_id: 'tryon', label: '产品试穿', category: '素材工作台', sort_order: 3 },
      { nav_id: 'handheld', label: '手持产品', category: '素材工作台', sort_order: 4 },
      { nav_id: 'three-view', label: '三视图生成', category: '素材工作台', sort_order: 5 },
      { nav_id: 'deepseek-chat', label: '电商文案助手', category: 'AI辅助工具', sort_order: 0 },
      { nav_id: 'xiaohongshu', label: '小红书种草图文', category: '社媒图文引流', sort_order: 0 },
      { nav_id: 'social', label: '社媒POV出图', category: '社媒图文引流', sort_order: 1 },
      { nav_id: 'detailClone', label: '版式裂变', category: '店铺上架素材', sort_order: 0 },
      { nav_id: 'carousel', label: '产品轮播图', category: '店铺上架素材', sort_order: 1 },
      { nav_id: 'amazon-carousel', label: '亚马逊轮播图', category: '店铺上架素材', sort_order: 2 },
      { nav_id: 'detail2', label: '详情页设计', category: '店铺上架素材', sort_order: 3 },
      { nav_id: 'banner', label: 'Banner设计', category: '店铺上架素材', sort_order: 4 },
      { nav_id: 'poster', label: '智能海报设计', category: '店铺上架素材', sort_order: 5 },
      { nav_id: 'storyboard', label: '故事板', category: '短视频带货引流', sort_order: 0 },
      { nav_id: 'tk-video', label: 'TK脚本图', category: '短视频带货引流', sort_order: 1 },

    ];
    for (const n of defaultNavItems) {
      await pool.execute(
        'INSERT INTO nav_config (nav_id, label, category, enabled, sort_order) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE label = VALUES(label), category = VALUES(category), sort_order = VALUES(sort_order), enabled = VALUES(enabled)',
        [n.nav_id, n.label, n.category, n.enabled ?? 1, n.sort_order]
      );
    }
    console.log('✅ nav_config 表初始化完成');
  } catch (error) {
    console.log('ℹ️ nav_config 表初始化失败:', error);
  }
})();

// 初始化优惠券表
(async () => {
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS coupons (
        id INT PRIMARY KEY AUTO_INCREMENT,
        code VARCHAR(50) NOT NULL UNIQUE COMMENT '优惠券码',
        credits DECIMAL(10,2) NOT NULL COMMENT '面额积分',
        max_claims INT NOT NULL DEFAULT 0 COMMENT '领取名额(0=不限)',
        claimed_count INT NOT NULL DEFAULT 0 COMMENT '已领取次数',
        claim_deadline DATETIME NOT NULL COMMENT '最晚领取时间',
        expire_days INT NOT NULL DEFAULT 30 COMMENT '领取后多少天内用完',
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ coupons 表初始化完成');
  } catch (error) {
    console.log('ℹ️ coupons 表初始化失败:', (error as any)?.message?.substring(0, 100));
  }

  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS coupon_claims (
        id INT PRIMARY KEY AUTO_INCREMENT,
        coupon_id INT NOT NULL,
        user_id INT NOT NULL,
        credits DECIMAL(10,2) NOT NULL COMMENT '领取积分',
        claimed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL COMMENT '积分失效时间',
        expired TINYINT(1) DEFAULT 0 COMMENT '是否已过期失效',
        FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_coupon_user (coupon_id, user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ coupon_claims 表初始化完成');
  } catch (error) {
    console.log('ℹ️ coupon_claims 表初始化失败:', (error as any)?.message?.substring(0, 100));
  }

  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS credit_buckets (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        total_amount DECIMAL(10,2) NOT NULL COMMENT '原始金额',
        remaining_amount DECIMAL(10,2) NOT NULL COMMENT '剩余金额',
        source VARCHAR(20) NOT NULL COMMENT '来源: recharge, coupon',
        coupon_claim_id INT NULL COMMENT '关联coupon_claims.id',
        expires_at DATETIME NULL COMMENT '过期时间(NULL=永久)',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_expires (user_id, expires_at),
        INDEX idx_coupon_claim (coupon_claim_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ credit_buckets 表初始化完成');
  } catch (error) {
    console.log('ℹ️ credit_buckets 表初始化失败:', (error as any)?.message?.substring(0, 100));
  }

  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS canvas_states (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL UNIQUE,
        state_data JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ canvas_states 表初始化完成');
  } catch (error) {
    console.log('ℹ️ canvas_states 表初始化失败:', (error as any)?.message?.substring(0, 100));
  }

  // 创建 sessions 表（如果不存在）
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        token VARCHAR(64) NOT NULL UNIQUE,
        ip_address VARCHAR(45),
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_token (token),
        INDEX idx_user_id (user_id),
        INDEX idx_expires_at (expires_at),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户会话表'
    `);
    console.log('✅ sessions 表初始化完成');
  } catch (error) {
    console.log('ℹ️ sessions 表初始化失败:', (error as any)?.message?.substring(0, 100));
  }
})();

// CORS 中间件必须在所有其他中间件之前
const ALLOWED_ORIGINS = [
  'https://softhooky.com',
  'https://www.softhooky.com',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
];

app.use((req, res, next) => {
  const origin = req.headers.origin;

  // 判断是否为开发环境（本地地址）或允许的来源
  const isAllowed = origin && (
    ALLOWED_ORIGINS.includes(origin) ||
    // 开发环境：允许所有 localhost / 127.0.0.1 变体
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
    // Electron file:// 协议
    origin === 'null'
  );

  if (origin && isAllowed) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  }

  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, withCredentials');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// JSON 中间件 - 大文件上传支持
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use(express.text({ limit: '100mb' }));
app.use(express.raw({ type: 'multipart/form-data', limit: '100mb' }));

// 验证码存储 (内存)
const verificationCodes = new Map<string, { code: string; expiresAt: number }>();

// 邮件发送函数
async function sendVerificationEmail(to: string, code: string) {
  console.log('📧 开始发送邮件到:', to);

  // SMTP 配置 from environment variables
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.163.com',
    port: 465,
    secure: true,
    auth: {
      user: process.env.SMTP_USER || 'softhooky@163.com',
      pass: process.env.SMTP_PASS || ''
    }
  });

  const mailOptions = {
    from: process.env.SMTP_FROM || '"SoftHooky" <softhooky@163.com>',
    to: to,
    subject: '【SoftHooky】您的验证码 - ' + code,
    text: `您的验证码是: ${code}\n\n验证码有效期为 10 分钟。\n\n如果这不是您的操作，请忽略此邮件。\n\n请查看垃圾邮件文件夹如果您没有在收件箱找到此邮件。`,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 500px; margin: 0 auto; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #333; margin: 0;">SoftHooky</h1>
        </div>
        <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin-bottom: 20px;">
          <p style="color: #333; font-size: 16px; margin: 0 0 15px 0;">您好！</p>
          <p style="color: #666; font-size: 14px; margin: 0 0 15px 0;">您的验证码是：</p>
          <div style="background: #ffffff; padding: 15px 30px; font-size: 36px; letter-spacing: 10px; font-weight: bold; color: #1a73e8; text-align: center; margin: 20px 0; border-radius: 8px; border: 2px dashed #1a73e8;">
            ${code}
          </div>
          <p style="color: #666; font-size: 14px; margin: 0 0 10px 0;">⏰ 验证码有效期为 <strong>10 分钟</strong></p>
          <p style="color: #999; font-size: 12px; margin: 0;">如果这不是您的操作，请忽略此邮件。</p>
        </div>
        <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
          <p style="color: #856404; font-size: 12px; margin: 0;">
            📧 没有收到邮件？请检查您的<strong>垃圾邮件</strong>文件夹，或将 softhooky@163.com 添加到通讯录。
          </p>
        </div>
        <div style="text-align: center; color: #999; font-size: 12px;">
          <p style="margin: 0;">此邮件由系统自动发送，请勿回复。</p>
        </div>
      </div>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('📧 邮件发送成功，messageId:', info.messageId);
    return info;
  } catch (error: any) {
    console.error('📧 邮件发送失败:', error.message);
    throw error;
  }
}

// 发送管理员通知邮件（新用户注册）
async function sendAdminNotificationEmail(email: string, ipAddress: string, userId: number) {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    console.log('📧 未配置管理员邮箱，跳过发送通知');
    return;
  }

  console.log('📧 发送管理员通知邮件到:', adminEmail);

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.163.com',
    port: 465,
    secure: true,
    auth: {
      user: process.env.SMTP_USER || 'softhooky@163.com',
      pass: process.env.SMTP_PASS || ''
    }
  });

  const mailOptions = {
    from: process.env.SMTP_FROM || '"SoftHooky" <softhooky@163.com>',
    to: adminEmail,
    subject: '【SoftHooky】新用户注册通知',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 500px; margin: 0 auto; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #333; margin: 0;">SoftHooky</h1>
        </div>
        <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin-bottom: 20px;">
          <h2 style="color: #1a73e8; font-size: 18px; margin: 0 0 15px 0;">🎉 新用户注册</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #666; font-size: 14px;">用户邮箱</td>
              <td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #333; font-size: 14px; font-weight: bold;">${email}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #666; font-size: 14px;">用户ID</td>
              <td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #333; font-size: 14px;">${userId}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #666; font-size: 14px;">注册IP</td>
              <td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #333; font-size: 14px;">${ipAddress}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; font-size: 14px;">注册时间</td>
              <td style="padding: 8px 0; color: #333; font-size: 14px;">${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</td>
            </tr>
          </table>
        </div>
        <div style="text-align: center; color: #999; font-size: 12px;">
          <p style="margin: 0;">此邮件由系统自动发送，请勿回复。</p>
        </div>
      </div>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('📧 管理员通知邮件发送成功，messageId:', info.messageId);
    return info;
  } catch (error: any) {
    console.error('📧 管理员通知邮件发送失败:', error.message);
  }
}

// 发送提现通知邮件给管理员
async function sendWithdrawNotificationEmail(agentEmail: string, amount: number, accountType: string, accountId: string) {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    console.log('📧 未配置管理员邮箱，跳过发送通知');
    return;
  }

  console.log('📧 发送提现通知邮件到:', adminEmail);

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.163.com',
    port: 465,
    secure: true,
    auth: {
      user: process.env.SMTP_USER || 'softhooky@163.com',
      pass: process.env.SMTP_PASS || ''
    }
  });

  const accountLabel = accountType === 'wechat' ? '微信' : '支付宝';
  const mailOptions = {
    from: process.env.SMTP_FROM || '"SoftHooky" <softhooky@163.com>',
    to: adminEmail,
    subject: `【SoftHooky】代理提现通知 - ¥${amount}`,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 500px; margin: 0 auto; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #333; margin: 0;">SoftHooky</h1>
        </div>
        <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin-bottom: 20px;">
          <h2 style="color: #d93025; font-size: 18px; margin: 0 0 15px 0;">💰 代理提现申请</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #666; font-size: 14px;">代理邮箱</td>
              <td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #333; font-size: 14px; font-weight: bold;">${agentEmail}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #666; font-size: 14px;">提现金额</td>
              <td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #d93025; font-size: 14px; font-weight: bold;">¥${amount}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #666; font-size: 14px;">收款方式</td>
              <td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #333; font-size: 14px;">${accountLabel}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #666; font-size: 14px;">收款账号</td>
              <td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #333; font-size: 14px;">${accountId}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; font-size: 14px;">申请时间</td>
              <td style="padding: 8px 0; color: #333; font-size: 14px;">${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</td>
            </tr>
          </table>
        </div>
        <div style="text-align: center;">
          <a href="${process.env.ADMIN_URL || 'https://softhooky.com/admin/agents'}" style="display: inline-block; padding: 12px 24px; background: #d93025; color: white; text-decoration: none; border-radius: 6px; font-size: 14px;">前往处理</a>
        </div>
        <div style="text-align: center; color: #999; font-size: 12px; margin-top: 20px;">
          <p style="margin: 0;">此邮件由系统自动发送，请勿回复。</p>
        </div>
      </div>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('📧 提现通知邮件发送成功，messageId:', info.messageId);
    return info;
  } catch (error: any) {
    console.error('📧 提现通知邮件发送失败:', error.message);
  }
}

// 生成随机验证码 (6位字母数字混合)
function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// 辅助函数：从 URL 提取文件扩展名
function getExtensionFromUrl(url: string): string {
  try {
    const urlPath = new URL(url).pathname;
    const match = urlPath.match(/\.([a-zA-Z0-9]+)$/);
    if (match && match[1]) {
      return match[1].toLowerCase();
    }
  } catch (e) {
    console.warn('Failed to parse extension from URL:', url);
  }
  return 'png';
}

// 用户名缓存（减少并行上传时重复 DB 查询）
const userNameCache = new Map<string, { username: string; time: number }>();
const USERNAME_CACHE_TTL = 60000; // 1分钟

function getCachedUsername(key: string): string | undefined {
  const cached = userNameCache.get(key);
  if (cached && Date.now() - cached.time < USERNAME_CACHE_TTL) {
    return cached.username;
  }
  return undefined;
}

function setCachedUsername(key: string, username: string) {
  userNameCache.set(key, { username, time: Date.now() });
}

// COS 上传辅助函数
async function uploadToCos(imageBuffer: Buffer, extension: string = 'png', userId?: number, subUserId?: number): Promise<string> {
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);

  // 获取用户名/子账号名用于路径（带缓存）
  let userPath = '';
  if (userId) {
    try {
      const cacheKey = subUserId ? `${userId}_${subUserId}` : `${userId}`;
      let cachedPath = getCachedUsername(cacheKey);
      if (cachedPath) {
        userPath = cachedPath;
      } else {
        const user = await userDb.findById(userId);
        const username = user?.name || user?.email?.split('@')[0] || `user${userId}`;
        const safeUsername = username.replace(/[^a-zA-Z0-9一-龥]/g, '_').substring(0, 20);

        if (subUserId) {
          const subUser = await userDb.findById(subUserId);
          const subUsername = subUser?.name || `sub${subUserId}`;
          const safeSubUsername = subUsername.replace(/[^a-zA-Z0-9一-龥]/g, '_').substring(0, 20);
          userPath = `user/${safeUsername}/${safeSubUsername}/${year}/${month}/`;
        } else {
          userPath = `user/${safeUsername}/${year}/${month}/`;
        }
        setCachedUsername(cacheKey, userPath);
      }
    } catch (err) {
      userPath = subUserId ? `${userId}/${subUserId}/${year}/${month}/` : `${userId}/${year}/${month}/`;
    }
  }
  const fileName = `${userPath}generated-${timestamp}-${randomStr}.${extension}`;

  const command = new PutObjectCommand({
    Bucket: process.env.COS_BUCKET!,
    Key: fileName,
    Body: imageBuffer,
    ContentType: `image/${extension}`,
  });

  await cosClient.send(command);

  const resultUrl = `${process.env.COS_PUBLIC_URL}/${fileName}`;
  return resultUrl;
}

// COS 上传重试函数
async function uploadToCosWithRetry(
  imageBuffer: Buffer,
  extension: string,
  userId: number,
  subUserId?: number,
  maxRetries: number = 1
): Promise<string> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`📤 上传到COS (尝试 ${attempt}/${maxRetries})...`);
      return await uploadToCos(imageBuffer, extension, userId, subUserId);
    } catch (error: any) {
      console.error(`❌ 上传失败 (${attempt}/${maxRetries}):`, error.message);

      if (attempt === maxRetries) {
        throw new Error(`上传失败，已重试${maxRetries}次: ${error.message}`);
      }

      // 指数退避：1秒、2秒、4秒
      const delay = Math.pow(2, attempt - 1) * 1000;
      console.log(`⏳ 等待${delay}ms后重试...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

async function startServer() {
  let PORT = parseInt(process.env.PORT, 10) || 3001;

  // 健康检查端点（必须在任何可能阻塞的操作之前注册，确保开机自检通过）
  app.get("/api/health", (req, res) => {
    res.json({ success: true, message: '服务器正常运行' });
  });

  // 添加请求日志中间件
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`, req.body ? `(body: ${JSON.stringify(req.body).substring(0, 100)})` : '');
    next();
  });

  // 账号解锁（重置登录限制）
  app.post("/api/auth/unlock", async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: '请输入邮箱' });
    try {
      // 重置数据库中的登录次数和锁定状态
      await pool.execute(
        'UPDATE users SET login_attempts = 0, locked_until = NULL WHERE email = ?',
        [email]
      );
      // 清空内存中的 IP 登录失败记录
      ipLoginFailures.clear();
      console.log(`📋 账号已解锁: ${email}`);
      res.json({ success: true, message: '账号已解锁，请重新登录' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: '解锁失败' });
    }
  });

  // ==================== Tianai-Captcha ====================
  const captchaVerifiedTokens = new Set<string>();

  function generateCaptchaId(): string {
    return crypto.randomUUID().replace(/-/g, '');
  }

  interface CaptchaData {
    id: string;
    type: string;
    backgroundImage: string;
    templateImage: string;
  }

  const captchaAnswers = new Map<string, { answer: number; expires: number }>();

  // Scenes with different visual themes
  const scenes = [
    { bg: ['#1a2a6c', '#b21f1f', '#fdbb2d'] },
    { bg: ['#0f2027', '#203a43', '#2c5364'] },
    { bg: ['#134e5e', '#71b280'] },
    { bg: ['#fc4a1a', '#f7b733'] },
    { bg: ['#8e44ad', '#3498db'] },
  ];

  const CW = 300, CH = 180;  // tac content area
  const PW = 55, PH = 75;    // puzzle piece size

  function svgScene(w: number, h: number, scene: { bg: string[] }): string {
    const gradStops = scene.bg.map((c, i) =>
      `<stop offset="${Math.round(i / (scene.bg.length - 1) * 100)}%" stop-color="${c}"/>`
    ).join('');
    return `<defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">${gradStops}</linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#g)"/>
<circle cx="${w * 0.82}" cy="${h * 0.2}" r="28" fill="rgba(255,255,255,0.12)"/>
<circle cx="${w * 0.12}" cy="${h * 0.18}" r="18" fill="rgba(255,255,255,0.08)"/>
<path d="M0 ${h} Q${w / 4} ${h - 35} ${w / 2} ${h} Q${w * 3 / 4} ${h - 25} ${w} ${h}" fill="rgba(255,255,255,0.10)"/>`;
  }

  function makeSvgCaptcha(): CaptchaData {
    const id = generateCaptchaId();
    const scene = scenes[Math.floor(Math.random() * scenes.length)];
    // holeX must be within slider range [30, 200] (end is ~215)
    const holeX = 30 + Math.floor(Math.random() * 170);
    const holeY = 20 + Math.floor(Math.random() * (CH - PH - 30));

    const sceneContent = svgScene(CW, CH, scene);

    // Background: scene + transparent hole over semi-transparent dark overlay
    const bgSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CW}" height="${CH}">
      ${sceneContent}
      <path d="M0 0 L${CW} 0 L${CW} ${CH} L0 ${CH} Z M${holeX} ${holeY} L${holeX + PW} ${holeY} L${holeX + PW} ${holeY + PH} L${holeX} ${holeY + PH} Z" fill="rgba(0,0,0,0.35)" fill-rule="evenodd"/>
    </svg>`;
    const bgUri = 'data:image/svg+xml,' + encodeURIComponent(bgSvg);

    // Template: transparent piece with just a highlighted border
    const tplSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PW}" height="${CH}">
      <defs><filter id="s"><feDropShadow dx="2" dy="2" stdDeviation="3" flood-opacity=".5"/></filter></defs>
      <rect x="1" y="${holeY + 1}" width="${PW - 2}" height="${PH - 2}" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="2" rx="4" filter="url(#s)"/>
    </svg>`;
    const tplUri = 'data:image/svg+xml,' + encodeURIComponent(tplSvg);

    captchaAnswers.set(id, { answer: holeX, expires: Date.now() + 120000 });
    setTimeout(() => captchaAnswers.delete(id), 120000);

    return { id, type: 'SLIDER', backgroundImage: bgUri, templateImage: tplUri };
  }

  app.post("/api/captcha/tianai/gen", async (req, res) => {
    const data = makeSvgCaptcha();
    res.json({ code: 200, msg: 'success', data });
  });

  app.post("/api/captcha/tianai/check", async (req, res) => {
    try {
      const { id, data: trackData } = req.body;
      if (!id || !trackData?.trackList?.length) {
        return res.json({ code: 4001, msg: '参数错误' });
      }
      const stored = captchaAnswers.get(id);
      if (!stored || Date.now() > stored.expires) {
        captchaAnswers.delete(id);
        return res.json({ code: 4001, msg: '验证码已过期' });
      }
      // SDK sends a NEW object without moveX/startX.
      // Compute moveX from trackList: last event.x - first event.x
      const track = trackData.trackList;
      const firstX = track[0]?.x || 0;
      const lastX = track[track.length - 1]?.x || 0;
      const moveX = Math.abs(lastX - firstX);
      const diff = Math.abs(moveX - stored.answer);
      if (diff > 25) {
        return res.json({ code: 4001, msg: '验证失败，请重试' });
      }
      captchaAnswers.delete(id);
      const token = generateCaptchaId();
      captchaVerifiedTokens.add(token);
      setTimeout(() => captchaVerifiedTokens.delete(token), 5 * 60 * 1000);
      res.json({ code: 200, msg: 'success', data: { token, id } });
    } catch (err: any) {
      console.error('Captcha check error:', err);
      res.json({ code: 5000, msg: '服务器错误' });
    }
  });

  // 调试端点 - 检查sessions表
  app.get("/api/debug/sessions", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      console.log('🔍 debug/sessions 被调用');
      const [allSessions] = await pool.execute('SELECT id, user_id, token, ip_address, expires_at FROM sessions LIMIT 10');
      console.log('🔍 所有sessions:', JSON.stringify(allSessions));
      res.json({
        success: true,
        allSessions,
        currentTime: new Date()
      });
    } catch (error: any) {
      console.error('❌ debug/sessions 错误:', error);
      res.json({ success: false, error: error.message });
    }
  });

  // 验证码 API ====================

  // 发送验证码
  app.post("/api/auth/send-code", async (req, res) => {
    const { email, isResetPassword } = req.body;
    const ip = getClientIP(req);

    // IP 限流检查：每分钟最多5次
    const rateLimit = checkRateLimit(ip, 'send-code', 5, 60000);
    if (rateLimit.limited) {
      return res.status(429).json({ success: false, message: rateLimit.message });
    }

    console.log('📧 收到发送验证码请求:', { email, isResetPassword, ip });

    // 重置密码需要验证图形验证码
    if (isResetPassword) {
      const { captchaToken } = req.body;
      if (!captchaToken || !captchaVerifiedTokens.has(captchaToken)) {
        return res.status(400).json({ success: false, message: '请先完成安全验证' });
      }
      captchaVerifiedTokens.delete(captchaToken);
    }

    if (!email || !email.includes('@')) {
      console.error('❌ 邮箱格式无效:', email);
      return res.status(400).json({ success: false, message: '请输入有效的邮箱地址' });
    }

    // 检查是否已注册
    try {
      const existingUser = await userDb.findByEmail(email);
      
      // 如果是重置密码，邮箱必须已注册
      if (isResetPassword && !existingUser) {
        console.error('❌ 邮箱未注册:', email);
        return res.status(400).json({ success: false, message: '该邮箱未注册' });
      }
      
      // 如果是注册，邮箱不能已注册
      if (!isResetPassword && existingUser) {
        console.error('❌ 邮箱已注册:', email);
        return res.status(400).json({ success: false, message: '该邮箱已被注册' });
      }
    } catch (dbError: any) {
      console.error('❌ 数据库查询错误:', dbError.message);
      return res.status(500).json({ success: false, message: '服务器错误，请稍后重试' });
    }

    // 检查是否频繁发送 (60秒内只能发一次)
    const existing = verificationCodes.get(email);
    if (existing && existing.expiresAt > Date.now()) {
      const remaining = Math.ceil((existing.expiresAt - Date.now()) / 1000);
      console.warn('⚠️ 验证码发送过于频繁:', email, `剩余${remaining}秒`);
      return res.status(400).json({ success: false, message: `请等待 ${remaining} 秒后重新发送` });
    }

    const code = generateCode();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10分钟有效

    verificationCodes.set(email, { code, expiresAt });

    // 重试机制：最多重试 3 次
    let success = false;
    let lastError: any = null;
    
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`📧 发送验证码到 ${email} (尝试 ${attempt}/3)...`);
        await sendVerificationEmail(email, code);
        console.log(`✅ 验证码已发送到 ${email}: ${code}`);
        success = true;
        break;
      } catch (error: any) {
        lastError = error;
        console.error(`❌ 发送验证码失败 (${attempt}/3):`, error.message);
        
        if (attempt < 3) {
          // 等待 2 秒后重试
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    }

    if (success) {
      // 不要在响应中返回验证码，这是安全问题
      res.json({ success: true, message: '验证码已发送' });
    } else {
      console.error('❌ 发送验证码最终失败:', lastError?.message);
      res.status(500).json({ success: false, message: '发送验证码失败，请稍后重试' });
    }
  });

  // 验证验证码
  app.post("/api/auth/verify-code", async (req, res) => {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ success: false, message: '请提供邮箱和验证码' });
    }

    const stored = verificationCodes.get(email);

    if (!stored) {
      return res.status(400).json({ success: false, message: '请先获取验证码' });
    }

    if (stored.expiresAt < Date.now()) {
      verificationCodes.delete(email);
      return res.status(400).json({ success: false, message: '验证码已过期，请重新获取' });
    }

    if (stored.code !== code.toUpperCase()) {
      return res.status(400).json({ success: false, message: '验证码错误' });
    }

    // 验证成功，删除验证码
    verificationCodes.delete(email);
    res.json({ success: true, message: '验证成功' });
  });

  // 重置密码
  app.post("/api/auth/reset-password", async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: '请提供邮箱和新密码' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: '密码至少需要 6 位' });
    }

    try {
      // 查找用户
      const user = await userDb.findByEmail(email);
      if (!user) {
        return res.status(400).json({ success: false, message: '该邮箱未注册' });
      }

      // 更新密码，同时清除登录错误次数和锁定状态
      const passwordHash = await hashPassword(password);
      await pool.execute(
        'UPDATE users SET password_hash = ?, login_attempts = 0, locked_until = NULL WHERE id = ?',
        [passwordHash, user.id]
      );

      console.log(`✅ 用户密码已重置: ${email}`);
      res.json({ success: true, message: '密码重置成功' });
    } catch (error: any) {
      console.error('重置密码失败:', error);
      res.status(500).json({ success: false, message: '重置密码失败，请稍后重试' });
    }
  });

  // ==================== 认证 API ====================

  // 用户注册（需邮箱验证）
  app.post("/api/auth/register", async (req, res) => {
    const { email, password, code, apiKey, inviteCode } = req.body;

    // 获取客户端 IP 地址
    const ipAddress = getClientIP(req);

    // IP 限流检查：每分钟最多3次
    const rateLimit = checkRateLimit(ipAddress, 'register', 3, 60000);
    if (rateLimit.limited) {
      return res.status(429).json({ success: false, message: rateLimit.message });
    }

    // 验证输入
    if (!email || !password) {
      return res.status(400).json({ success: false, message: '请填写邮箱和密码' });
    }

    if (!code) {
      return res.status(400).json({ success: false, message: '请输入验证码' });
    }

    // 验证验证码
    const stored = verificationCodes.get(email);
    
    if (!stored) {
      return res.status(400).json({ success: false, message: '请先获取验证码' });
    }
    if (stored.expiresAt < Date.now()) {
      verificationCodes.delete(email);
      return res.status(400).json({ success: false, message: '验证码已过期，请重新获取' });
    }
    if (stored.code !== code.toUpperCase()) {
      return res.status(400).json({ success: false, message: '验证码错误' });
    }

    if (!email.includes('@')) {
      return res.status(400).json({ success: false, message: '请输入有效的邮箱地址' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: '密码至少需要 6 位' });
    }

    try {
      // 检查邮箱是否已存在
      const existingUser = await userDb.findByEmail(email);
      if (existingUser) {
        return res.status(400).json({ success: false, message: '该邮箱已被注册' });
      }

      // 创建用户（积分默认为0，自动生成apiKey）
      const passwordHash = await hashPassword(password);
      const finalApiKey = apiKey || 'sk-r5Clizar6aV39YsxLbHR3rW209LqmnYa5fLT1iePRBtfZT47';
      const userId = await userDb.create(email, passwordHash, finalApiKey);
      // 新注册用户赠送 1 积分
      let giftAmount = 1;

      // 处理邀请码：通过代理注册
      let invitedByAgent: any = null;
      if (inviteCode) {
        try {
          // 验证邀请码
          const inviteRecord = await inviteCodeDb.validate(inviteCode);
          if (inviteRecord) {
            invitedByAgent = await userDb.findById(inviteRecord.parent_user_id);
            if (invitedByAgent && invitedByAgent.is_agent) {
              // 绑定代理关系
              await pool.execute('UPDATE users SET invited_by = ? WHERE id = ?', [invitedByAgent.id, userId]);
              // 从代理的佣金余额扣除赠送积分
              const giftCredits = parseFloat(process.env.GIFT_CREDITS_ON_INVITE || '3');
              if (invitedByAgent.commission_balance >= giftCredits) {
                await pool.execute('UPDATE users SET commission_balance = commission_balance - ? WHERE id = ?', [giftCredits, invitedByAgent.id]);
                giftAmount += giftCredits;
                await commissionDb.create(invitedByAgent.id, userId, -giftCredits, 'gift', '注册赠送');
              } else {
                // 代理余额不足，只给基础赠送
                giftAmount += Math.max(0, invitedByAgent.commission_balance);
                await pool.execute('UPDATE users SET commission_balance = 0 WHERE id = ?', [invitedByAgent.id]);
                if (invitedByAgent.commission_balance > 0) {
                  await commissionDb.create(invitedByAgent.id, userId, -invitedByAgent.commission_balance, 'gift', '注册赠送(余额不足)');
                }
              }
              console.log(`✅ 用户通过代理注册: ${email} -> 代理 ${invitedByAgent.email}, 获赠 ${giftAmount} 积分`);
            }
          }
        } catch (err) {
          console.error('邀请码处理失败:', err);
          // 邀请码处理失败不影响注册
        }
      }
      await userDb.updateCredits(userId, giftAmount);

      // 验证成功，删除验证码
      verificationCodes.delete(email);

      // 创建会话（传入 IP 地址，自动踢掉该账号在该 IP 的旧会话）
      const token = generateToken();
      await sessionDb.create(userId, token, ipAddress);

      // 获取用户信息
      const user = await userDb.findById(userId);

      console.log(`✅ 用户注册成功: ${email} (IP: ${ipAddress})`);

      // 异步发送管理员通知邮件（不阻塞响应）
      sendAdminNotificationEmail(email, ipAddress, userId).catch(err => {
        console.error('发送管理员通知邮件失败:', err);
      });

      res.json({
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          credits: user.credits,
          apiKey: user.api_key,
          is_agent: !!user.is_agent,
          invited_by: user.invited_by || null
        },
        message: '注册成功'
      });
    } catch (error: any) {
      console.error('Registration error:', error);
      res.status(500).json({ success: false, message: '注册失败，请稍后重试' });
    }
  });

  // 用户登录
  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;

    // 获取客户端 IP 地址
    const ipAddress = getClientIP(req);

    // IP 限流检查：每分钟最多10次
    const rateLimit = checkRateLimit(ipAddress, 'login', 10, 60000);
    if (rateLimit.limited) {
      return res.status(429).json({ success: false, message: rateLimit.message });
    }

    // 检查 IP 是否被锁定
    const ipLockCheck = isIPLocked(ipAddress);
    if (ipLockCheck.locked) {
      return res.status(429).json({ success: false, message: ipLockCheck.reason });
    }

    if (!email || !password) {
      return res.status(400).json({ success: false, message: '请输入邮箱和密码' });
    }

    // 验证 AJ-Captcha
    const { captchaToken } = req.body;
    if (!captchaToken || !captchaVerifiedTokens.has(captchaToken)) {
      return res.status(400).json({ success: false, message: '请先完成安全验证' });
    }
    captchaVerifiedTokens.delete(captchaToken);

    try {
      // 查找用户
      const user = await userDb.findByEmail(email);
      if (!user) {
        return res.status(401).json({ success: false, message: '邮箱或密码错误' });
      }

      // 检查是否被锁定
      if (user.locked_until && new Date(user.locked_until) > new Date()) {
        const lockedTime = new Date(user.locked_until);
        const hoursLeft = Math.ceil((lockedTime.getTime() - Date.now()) / (1000 * 60 * 60));
        return res.status(403).json({ 
          success: false, 
          message: `账号已被锁定，请${hoursLeft}小时后再试，或通过忘记密码重置`,
          locked: true,
          lockedUntil: user.locked_until
        });
      }

      // 验证密码
      const isValid = await verifyPassword(password, user.password_hash);
      if (!isValid) {
        // 密码错误，增加登录失败次数
        const newAttempts = (user.login_attempts || 0) + 1;

        // 记录 IP 登录失败
        const ipAttempts = recordIPLoginFailure(ipAddress);
        if (ipAttempts >= 10) {
          console.log(`❌ IP ${ipAddress} 登录失败${ipAttempts}次，已被临时锁定30分钟`);
          return res.status(429).json({
            success: false,
            message: '登录尝试次数过多，请30分钟后再试'
          });
        }

        if (newAttempts >= 5) {
          // 锁定到明天凌晨
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          tomorrow.setHours(0, 0, 0, 0);

          await pool.execute(
            'UPDATE users SET login_attempts = ?, locked_until = ? WHERE id = ?',
            [newAttempts, tomorrow, user.id]
          );

          console.log(`❌ 用户 ${email} 登录失败${newAttempts}次，账号已锁定至 ${tomorrow}`);
          return res.status(403).json({
            success: false,
            message: '密码错误次数过多，账号已锁定24小时，请明天再试或重置密码',
            locked: true
          });
        }

        await pool.execute(
          'UPDATE users SET login_attempts = ? WHERE id = ?',
          [newAttempts, user.id]
        );

        const remaining = 5 - newAttempts;
        console.log(`❌ 用户 ${email} 登录失败，剩余尝试次数: ${remaining}`);
        return res.status(401).json({
          success: false,
          message: `密码错误，还可以尝试${remaining}次`,
          attempts: newAttempts
        });
      }

      // 登录成功，清除登录失败次数和锁定状态
      await pool.execute(
        'UPDATE users SET login_attempts = 0, locked_until = NULL WHERE id = ?',
        [user.id]
      );

      // 清除 IP 登录失败记录
      clearIPLoginFailure(ipAddress);

      // 更新最后登录时间
      await userDb.updateLastLogin(user.id);

      // 创建会话（传入 IP 地址，自动踢掉该账号在该 IP 的旧会话）
      const token = generateToken();
      console.log(`🔐 用户登录: ${email} (IP: ${ipAddress}), 生成token: ${token}, 进程ID: ${process.pid}`);
      await sessionDb.create(user.id, token, ipAddress);
      console.log('✅ 会话创建成功，已踢掉该账号在该 IP 的旧会话');

      // 验证session是否创建成功
      const [verifyRows]: any = await pool.execute('SELECT id, token, LEFT(token, 10) as prefix, created_at FROM sessions WHERE user_id = ? ORDER BY id DESC', [user.id]);
      console.log('🔍 验证session创建 - 数据库中的所有session:', verifyRows);
      console.log('🔍 验证session创建 - 返回给用户的token:', token);

      res.json({
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          credits: user.credits,
          apiKey: user.api_key,
          recharge_disabled: !!user.recharge_disabled,
          is_agent: !!user.is_agent,
          invited_by: user.invited_by || null
        },
        message: '登录成功'
      });
    } catch (error: any) {
      console.error('Login error:', error);
      res.status(500).json({ success: false, message: '登录失败，请稍后重试', detail: error.message });
    }
  });

  // 验证 admin token（中间件）
  const adminMiddleware = async (req: any, res: any, next: any) => {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ success: false, message: '未登录' });
    }

    const session = await sessionDb.validate(token);
    if (!session) {
      return res.status(401).json({ success: false, message: '登录已过期，请重新登录' });
    }

    const user = await userDb.findById(session.user_id);
    if (!user || !user.is_admin) {
      return res.status(403).json({ success: false, message: '无权限访问' });
    }

    req.user = {
      id: user.id,
      email: user.email,
      isAdmin: true
    };
    next();
  };

  // 管理后台登录
  app.post("/api/admin/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      const ipAddress = getClientIP(req);

      if (!email || !password) {
        return res.status(400).json({ success: false, message: '邮箱和密码不能为空' });
      }

      // IP 限流检查：每分钟最多5次
      const rateLimit = checkRateLimit(ipAddress, 'admin-login', 5, 60000);
      if (rateLimit.limited) {
        console.log(`⚠️ 管理后台登录限流: ${email} from ${ipAddress}`);
        return res.status(429).json({ success: false, message: rateLimit.message });
      }

      // 检查 IP 是否被锁定
      const lockCheck = isIPLocked(ipAddress);
      if (lockCheck.locked) {
        console.log(`🔒 管理后台IP锁定: ${email} from ${ipAddress}`);
        return res.status(423).json({ success: false, message: lockCheck.reason });
      }

      // 从数据库查询用户
      const [users] = await pool.execute(
        'SELECT * FROM users WHERE email = ?',
        [email]
      );

      if (!users || (users as any[]).length === 0) {
        console.log(`❌ 管理后台登录失败(用户不存在): ${email} from ${ipAddress}`);
        recordIPLoginFailure(ipAddress);
        return res.status(401).json({ success: false, message: '邮箱或密码错误' });
      }

      const user = (users as any[])[0];
      const isValid = await verifyPassword(password, user.password_hash);

      if (!isValid) {
        console.log(`❌ 管理后台登录失败(密码错误): ${email} from ${ipAddress}`);
        recordIPLoginFailure(ipAddress);
        return res.status(401).json({ success: false, message: '邮箱或密码错误' });
      }

      // 检查是否是管理员
      if (!user.is_admin) {
        console.log(`🚫 管理后台登录失败(非管理员): ${email} from ${ipAddress}`);
        recordIPLoginFailure(ipAddress);
        return res.status(403).json({ success: false, message: '无权限访问管理后台' });
      }

      // 登录成功，清除失败记录
      clearIPLoginFailure(ipAddress);

      const token = generateToken();

      // 创建会话
      await sessionDb.create(user.id, token, ipAddress);

      console.log(`✅ 管理后台登录成功: ${email} from ${ipAddress}`);

      res.json({
        success: true,
        token,
        user: { id: user.id, email: user.email, isAdmin: true }
      });
    } catch (error: any) {
      console.error('Admin login error:', error);
      res.status(500).json({ success: false, message: '登录失败' });
    }
  });

  // 管理后台仪表板数据
  app.get("/api/admin/dashboard", adminMiddleware, async (req: any, res) => {
    try {
      // 总用户数
      const [userCountResult] = await pool.execute('SELECT COUNT(*) as count FROM users');
      const totalUsers = (userCountResult as any[])[0].count;

      // 今日新用户
      const [todayUsersResult] = await pool.execute(
        "SELECT COUNT(*) as count FROM users WHERE DATE(created_at) = CURDATE()"
      );
      const todayNewUsers = (todayUsersResult as any[])[0].count;

      // 总充值金额
      const [totalRechargeResult] = await pool.execute(
        "SELECT COALESCE(SUM(amount), 0) as total FROM payment_orders WHERE status = 'completed'"
      );
      const totalRechargeAmount = parseFloat((totalRechargeResult as any[])[0].total) || 0;

      // 今日充值金额
      const [todayRechargeResult] = await pool.execute(
        "SELECT COALESCE(SUM(amount), 0) as total FROM payment_orders WHERE status = 'completed' AND DATE(created_at) = CURDATE()"
      );
      const todayRechargeAmount = parseFloat((todayRechargeResult as any[])[0].total) || 0;

      // 待处理订单
      const [pendingOrdersResult] = await pool.execute(
        "SELECT COUNT(*) as count FROM payment_orders WHERE status = 'pending'"
      );
      const pendingOrders = (pendingOrdersResult as any[])[0].count;

      // 总消费积分
      const [consumptionResult] = await pool.execute(
        "SELECT COALESCE(SUM(ABS(amount)), 0) as total FROM credit_transactions WHERE amount < 0"
      );
      const totalConsumption = parseFloat((consumptionResult as any[])[0].total) || 0;

      // 今日消费积分
      const [todayConsumptionResult] = await pool.execute(
        "SELECT COALESCE(SUM(ABS(amount)), 0) as total FROM credit_transactions WHERE amount < 0 AND DATE(created_at) = CURDATE()"
      );
      const todayConsumption = parseFloat((todayConsumptionResult as any[])[0].total) || 0;

      // 近7天每日充值金额
      const [dailyRechargeResult] = await pool.execute(`
        SELECT DATE(created_at) as date, SUM(amount) as total
        FROM payment_orders
        WHERE status = 'completed' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
        GROUP BY DATE(created_at)
        ORDER BY date
      `);

      // 近7天每日消费积分
      const [dailyConsumptionResult] = await pool.execute(`
        SELECT DATE(created_at) as date, SUM(ABS(amount)) as total
        FROM credit_transactions
        WHERE amount < 0 AND created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
        GROUP BY DATE(created_at)
        ORDER BY date
      `);

      res.json({
        success: true,
        dashboard: {
          totalUsers,
          todayNewUsers,
          totalRechargeAmount,
          todayRechargeAmount,
          pendingOrders,
          totalConsumption,
          todayConsumption,
          dailyRecharge: dailyRechargeResult,
          dailyConsumption: dailyConsumptionResult
        }
      });
    } catch (error: any) {
      console.error('Dashboard error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // 管理后台用户列表
  app.get("/api/admin/users", adminMiddleware, async (req: any, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const pageSize = 20;
      const offset = (page - 1) * pageSize;

      const [totalResult] = await pool.execute('SELECT COUNT(*) as total FROM users');
      const total = (totalResult as any[])[0].total;

      const [users] = await pool.execute(
        `SELECT u.id, u.email, u.credits, u.is_enabled, u.recharge_disabled, u.is_admin, u.is_agent, u.applied_agent, u.created_at, u.last_login_at, u.invited_by, inviter.email as inviter_email
         FROM users u LEFT JOIN users inviter ON u.invited_by = inviter.id
         ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
        [pageSize, offset]
      );

      res.json({
        success: true,
        data: users,
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: '获取用户列表失败' });
    }
  });

  // 禁用/启用用户
  app.post("/api/admin/users/:id/toggle", adminMiddleware, async (req: any, res) => {
    try {
      const userId = parseInt(req.params.id);
      const { isEnabled } = req.body;

      if (typeof isEnabled !== 'boolean') {
        return res.status(400).json({ success: false, message: '参数错误' });
      }

      await pool.execute('UPDATE users SET is_enabled = ? WHERE id = ?', [isEnabled ? 1 : 0, userId]);
      res.json({ success: true, message: isEnabled ? '已启用' : '已禁用' });
    } catch (error: any) {
      console.error('切换用户状态失败:', error);
      res.status(500).json({ success: false, message: '操作失败' });
    }
  });

  // 禁止/允许用户充值
  app.post("/api/admin/users/:id/toggle-recharge", adminMiddleware, async (req: any, res) => {
    try {
      const userId = parseInt(req.params.id);
      const { rechargeDisabled } = req.body;

      if (typeof rechargeDisabled !== 'boolean') {
        return res.status(400).json({ success: false, message: '参数错误' });
      }

      await pool.execute('UPDATE users SET recharge_disabled = ? WHERE id = ?', [rechargeDisabled ? 1 : 0, userId]);
      res.json({ success: true, message: rechargeDisabled ? '充值已禁止' : '充值已恢复' });
    } catch (error: any) {
      console.error('切换充值状态失败:', error);
      res.status(500).json({ success: false, message: '操作失败' });
    }
  });

  // 管理后台用户详情
  app.get("/api/admin/users/:id", adminMiddleware, async (req: any, res) => {
    try {
      const userId = parseInt(req.params.id);
      const rechargePage = Math.max(1, parseInt(req.query.rechargePage as string) || 1);
      const rechargePageSize = 10;
      const rechargeOffset = (rechargePage - 1) * rechargePageSize;

      const [userResult] = await pool.execute(
        `SELECT u.id, u.email, u.credits, u.is_enabled, u.recharge_disabled, u.created_at, u.last_login_at, u.invited_by, inviter.email as inviter_email
         FROM users u LEFT JOIN users inviter ON u.invited_by = inviter.id
         WHERE u.id = ?`,
        [userId]
      );
      const user = (userResult as any[])[0];

      if (!user) return res.status(404).json({ success: false, message: '用户不存在' });

      // 充值记录分页
      const [recharges] = await pool.execute(
        'SELECT id, order_id, amount, status, created_at FROM payment_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
        [userId, rechargePageSize, rechargeOffset]
      );
      const [rechargeCountResult] = await pool.execute(
        'SELECT COUNT(*) as total FROM payment_orders WHERE user_id = ?',
        [userId]
      );
      const rechargeTotal = (rechargeCountResult as any[])[0].total;

      const [consumptions] = await pool.execute(
        `SELECT id, amount, type, description, created_at FROM credit_transactions WHERE user_id = ? AND type = 'consumption' ORDER BY created_at DESC LIMIT 20`,
        [userId]
      );
      const [subUsers] = await pool.execute(
        'SELECT id, email, name, is_enabled, created_at FROM sub_users WHERE parent_user_id = ?',
        [userId]
      );

      res.json({
        success: true,
        user,
        recharges,
        rechargePagination: {
          page: rechargePage,
          pageSize: rechargePageSize,
          total: rechargeTotal,
          totalPages: Math.ceil(rechargeTotal / rechargePageSize)
        },
        consumptions,
        subUsers
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: '获取用户详情失败' });
    }
  });

  // 管理后台订单列表
  app.get("/api/admin/orders", adminMiddleware, async (req: any, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const status = req.query.status;
      const pageSize = 20;
      const offset = (page - 1) * pageSize;

      let query = `SELECT po.id, po.order_id, po.user_id, po.amount, po.status, po.created_at, u.email FROM payment_orders po JOIN users u ON po.user_id = u.id`;
      let countQuery = 'SELECT COUNT(*) as total FROM payment_orders';
      const params: any[] = [];
      const countParams: any[] = [];

      if (status) {
        query += ' WHERE po.status = ?';
        countQuery += ' WHERE status = ?';
        params.push(status);
        countParams.push(status);
      }

      query += ' ORDER BY po.created_at DESC LIMIT ? OFFSET ?';
      params.push(pageSize, offset);

      const [orders] = await pool.query(query, params);
      const [totalResult] = await pool.query(countQuery, countParams);
      const total = (totalResult as any[])[0].total;

      res.json({
        success: true,
        data: orders,
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: '获取订单列表失败' });
    }
  });

  // 管理后台更新订单状态
  app.put("/api/admin/orders/:id", async (req, res) => {
    try {
      const orderId = parseInt(req.params.id);
      const { status } = req.body;

      if (!['pending', 'completed', 'failed'].includes(status)) {
        return res.status(400).json({ success: false, message: '无效的订单状态' });
      }

      await pool.execute('UPDATE payment_orders SET status = ? WHERE id = ?', [status, orderId]);
      res.json({ success: true, message: '订单状态已更新' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: '更新订单失败' });
    }
  });

  // 管理后台通知列表
  app.get("/api/admin/notifications", adminMiddleware, async (req: any, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const pageSize = 20;
      const offset = (page - 1) * pageSize;

      const [totalResult] = await pool.execute('SELECT COUNT(*) as total FROM notifications');
      const total = (totalResult as any[])[0].total;

      const [notifications] = await pool.execute(
        'SELECT * FROM notifications ORDER BY created_at DESC LIMIT ? OFFSET ?',
        [pageSize, offset]
      );

      res.json({
        success: true,
        data: notifications,
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: '获取通知列表失败' });
    }
  });

  // 管理后台创建通知
  app.post("/api/admin/notifications", adminMiddleware, async (req: any, res) => {
    try {
      const { title, content, is_active } = req.body;

      if (!title || !content) {
        return res.status(400).json({ success: false, message: '标题和内容不能为空' });
      }

      await pool.execute(
        'INSERT INTO notifications (title, content, is_active, created_at) VALUES (?, ?, ?, NOW())',
        [title, content, is_active !== false]
      );

      res.json({ success: true, message: '通知创建成功' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: '创建通知失败' });
    }
  });

  // 管理后台更新通知
  app.put("/api/admin/notifications/:id", adminMiddleware, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const { title, content, is_active } = req.body;

      await pool.execute(
        'UPDATE notifications SET title = ?, content = ?, is_active = ? WHERE id = ?',
        [title, content, is_active !== false, id]
      );

      res.json({ success: true, message: '通知更新成功' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: '更新通知失败' });
    }
  });

  // 管理后台删除通知
  app.delete("/api/admin/notifications/:id", adminMiddleware, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);

      await pool.execute('DELETE FROM notifications WHERE id = ?', [id]);

      res.json({ success: true, message: '通知删除成功' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: '删除通知失败' });
    }
  });

  // 获取用户可见的通知
  app.get("/api/notifications", async (req, res) => {
    try {
      const [notifications] = await pool.execute(
        'SELECT * FROM notifications WHERE is_active = 1 ORDER BY created_at DESC'
      );

      res.json({ success: true, data: notifications });
    } catch (error: any) {
      res.status(500).json({ success: false, message: '获取通知失败' });
    }
  });

  // 获取价格配置（公开接口）
  app.get("/api/pricing", async (req, res) => {
    try {
      // 获取平台默认价格
      const [rows]: any = await pool.execute(
        'SELECT `key`, name, price, enabled FROM pricing_config'
      );

      const pricing: Record<string, number> = {};
      for (const row of rows) {
        if (row.enabled) {
          pricing[row.key] = parseFloat(row.price);
        }
      }

      // 检查用户是否通过代理注册（可选认证）
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (token) {
        const session = await sessionDb.validate(token);
        if (session) {
          const user = await userDb.findById(session.user_id);
          if (user && user.invited_by) {
            // 查询上级代理的自定义定价
            const agentPricing = await agentDb.getPricing(user.invited_by);
            // 合并：代理定价覆盖平台默认
            for (const [key, price] of Object.entries(agentPricing)) {
              if (price > 0) {
                pricing[key] = price;
              }
            }
          }
        }
      }

      res.json({ success: true, data: pricing });
    } catch (error: any) {
      console.error('获取价格配置失败:', error);
      res.status(500).json({ success: false, message: '获取价格配置失败' });
    }
  });

  // 获取站点配置（公开接口）
  app.get("/api/site-config", async (req, res) => {
    try {
      const config = await getSiteConfig();
      res.json({ success: true, data: config });
    } catch (error: any) {
      console.error('获取站点配置失败:', error);
      res.status(500).json({ success: false, message: '获取站点配置失败' });
    }
  });

  // 获取可用模型列表（公开接口）
  app.get("/api/models", async (req, res) => {
    try {
      const [rows]: any = await pool.execute(
        'SELECT model_id, label, enabled, sort_order FROM models_config WHERE enabled = 1 ORDER BY sort_order ASC'
      );
      if (rows.length > 0) {
        res.json({ success: true, data: rows });
        return;
      }
      res.json({ success: true, data: [
        { model_id: 'seedream', label: 'Seedream', enabled: true, sort_order: 0 },
        { model_id: 'nanobann2', label: 'Nanobann2', enabled: true, sort_order: 1 },
        { model_id: 'gpt-image-2', label: 'GPT Image 2', enabled: true, sort_order: 2 },
      ]});
    } catch (error: any) {
      res.json({ success: true, data: [
        { model_id: 'seedream', label: 'Seedream', enabled: true, sort_order: 0 },
        { model_id: 'nanobann2', label: 'Nanobann2', enabled: true, sort_order: 1 },
        { model_id: 'gpt-image-2', label: 'GPT Image 2', enabled: true, sort_order: 2 },
      ]});
    }
  });

  // 获取模型列表（管理员，含禁用）
  app.get("/api/admin/models", adminMiddleware, async (req: any, res) => {
    try {
      const [rows]: any = await pool.execute(
        'SELECT model_id, label, enabled, sort_order FROM models_config ORDER BY sort_order ASC'
      );
      res.json({ success: true, data: rows });
    } catch (error: any) {
      res.status(500).json({ success: false, message: '获取模型列表失败' });
    }
  });

  // 切换模型启用/禁用
  app.put("/api/admin/models/:modelId/toggle", adminMiddleware, async (req: any, res) => {
    try {
      const { modelId } = req.params;
      const [rows]: any = await pool.execute('SELECT enabled FROM models_config WHERE model_id = ?', [modelId]);
      if (rows.length === 0) return res.status(404).json({ success: false, message: '模型不存在' });
      const newEnabled = rows[0].enabled ? 0 : 1;
      await pool.execute('UPDATE models_config SET enabled = ? WHERE model_id = ?', [newEnabled, modelId]);
      res.json({ success: true, enabled: !!newEnabled });
    } catch (error: any) {
      res.status(500).json({ success: false, message: '切换失败' });
    }
  });

// 更新模型信息（label, sort_order）
app.put("/api/admin/models/:modelId", adminMiddleware, async (req: any, res) => {
  try {
    const { modelId } = req.params;
    const { label, sort_order } = req.body;
    if (label) await pool.execute('UPDATE models_config SET label = ? WHERE model_id = ?', [label, modelId]);
    if (sort_order !== undefined) await pool.execute('UPDATE models_config SET sort_order = ? WHERE model_id = ?', [sort_order, modelId]);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, message: '更新失败' });
  }
});

// ==================== 每个导航页的模型顺序（已移除，前端固定模型顺序）====================

  // 获取导航菜单列表（公开接口）
  app.get("/api/nav", async (req, res) => {
    try {
      // 自动同步前端新增的导航项到数据库
      // 清理已下架的旧导航项
      await pool.execute("DELETE FROM nav_config WHERE nav_id IN ('nano-gen', 'detail', 'sora2-video', 'styleCopy', 'gpt54-chat', 'gemini-video', 'veo31')");
      const REQUIRED_NAV_ITEMS = [
        { nav_id: 'chat-gen', label: '创意生图', category: '素材工作台', enabled: 1, sort_order: 0 },
        { nav_id: 'productRefine', label: '产品精修', category: '素材工作台', enabled: 1, sort_order: 1 },
        { nav_id: 'productFusion', label: '产品融图', category: '素材工作台', enabled: 1, sort_order: 2 },
        { nav_id: 'tryon', label: '产品试穿', category: '素材工作台', enabled: 1, sort_order: 3 },
        { nav_id: 'handheld', label: '手持产品', category: '素材工作台', enabled: 1, sort_order: 4 },
        { nav_id: 'three-view', label: '三视图生成', category: '素材工作台', enabled: 1, sort_order: 5 },
        { nav_id: 'detailClone', label: '版式裂变', category: '店铺上架素材', enabled: 1, sort_order: 0 },
        { nav_id: 'carousel', label: '产品轮播图', category: '店铺上架素材', enabled: 1, sort_order: 1 },
        { nav_id: 'amazon-carousel', label: '亚马逊轮播图', category: '店铺上架素材', enabled: 1, sort_order: 2 },
        { nav_id: 'detail2', label: '详情页设计', category: '店铺上架素材', enabled: 1, sort_order: 3 },
        { nav_id: 'banner', label: 'Banner设计', category: '店铺上架素材', enabled: 1, sort_order: 4 },
        { nav_id: 'poster', label: '智能海报设计', category: '店铺上架素材', enabled: 1, sort_order: 5 },
        { nav_id: 'xiaohongshu', label: '小红书种草图文', category: '社媒图文引流', enabled: 1, sort_order: 0 },
        { nav_id: 'social', label: '社媒POV出图', category: '社媒图文引流', enabled: 1, sort_order: 1 },
        { nav_id: 'storyboard', label: '故事板', category: '短视频带货引流', enabled: 1, sort_order: 0 },
        { nav_id: 'tk-video', label: 'TK脚本图', category: '短视频带货引流', enabled: 1, sort_order: 1 },

        { nav_id: 'deepseek-chat', label: '电商文案助手', category: 'AI辅助工具', enabled: 1, sort_order: 0 },
      ];
      for (const item of REQUIRED_NAV_ITEMS) {
        const [existing]: any = await pool.execute('SELECT nav_id FROM nav_config WHERE nav_id = ?', [item.nav_id]);
        if (existing.length === 0) {
          await pool.execute(
            'INSERT INTO nav_config (nav_id, label, category, enabled, sort_order) VALUES (?, ?, ?, ?, ?)',
            [item.nav_id, item.label, item.category, item.enabled, item.sort_order]
          );
        }
      }

      const [rows]: any = await pool.execute(
        'SELECT nav_id, label, category, enabled, sort_order FROM nav_config WHERE enabled = 1 ORDER BY sort_order ASC'
      );
      res.json({ success: true, data: rows });
    } catch (error: any) {
      res.status(500).json({ success: false, message: '获取导航菜单失败' });
    }
  });

  // 获取导航菜单列表（管理员，含禁用）
  app.get("/api/admin/nav", adminMiddleware, async (req: any, res) => {
    try {
      // 清理已删除的旧导航项
      await pool.execute("DELETE FROM nav_config WHERE nav_id IN ('nano-gen', 'detail', 'sora2-video', 'styleCopy', 'gpt54-chat', 'gemini-video', 'veo31')");
      const [rows]: any = await pool.execute(
        'SELECT nav_id, label, category, enabled, sort_order FROM nav_config ORDER BY sort_order ASC'
      );
      res.json({ success: true, data: rows });
    } catch (error: any) { res.status(500).json({ success: false, message: '获取导航菜单失败' }); }
  });

  // 切换导航菜单启用/禁用
  app.put("/api/admin/nav/:navId/toggle", adminMiddleware, async (req: any, res) => {
    try {
      const { navId } = req.params;
      const [rows]: any = await pool.execute('SELECT enabled FROM nav_config WHERE nav_id = ?', [navId]);
      if (rows.length === 0) return res.status(404).json({ success: false, message: '导航项不存在' });
      const newEnabled = rows[0].enabled ? 0 : 1;
      await pool.execute('UPDATE nav_config SET enabled = ? WHERE nav_id = ?', [newEnabled, navId]);
      res.json({ success: true, enabled: !!newEnabled });
    } catch (error: any) { res.status(500).json({ success: false, message: '切换失败' }); }
  });

  // 更新导航菜单信息（label, sort_order, model_order）
  app.put("/api/admin/nav/:navId", adminMiddleware, async (req: any, res) => {
    try {
      const { navId } = req.params;
      const { label, sort_order } = req.body;
      if (label) await pool.execute('UPDATE nav_config SET label = ? WHERE nav_id = ?', [label, navId]);
      if (sort_order !== undefined) await pool.execute('UPDATE nav_config SET sort_order = ? WHERE nav_id = ?', [sort_order, navId]);
      res.json({ success: true });
    } catch (error: any) { res.status(500).json({ success: false, message: '更新失败' }); }
  });

  // 验证 token（中间件）
  const authMiddleware = async (req: any, res: any, next: any) => {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ success: false, message: '未登录' });
    }

    console.log('🔐 authMiddleware - 验证token:', token.substring(0, 10) + '...');
    const session = await sessionDb.validate(token);
    console.log('🔐 authMiddleware - session结果:', session);
    if (!session) {
      console.log('❌ authMiddleware - token无效或已过期');

      // 调试：直接查询数据库看token是否存在
      try {
        const [rows]: any = await pool.execute(
          'SELECT * FROM sessions WHERE token = ?',
          [token]
        );
        console.log('🔍 调试 - sessions表查询结果:', rows);
        if (rows.length === 0) {
          console.log('🔍 调试 - token不存在于sessions表');
        } else {
          console.log('🔍 调试 - token存在，但expires_at:', rows[0].expires_at, '当前时间:', new Date());
        }
      } catch (dbError) {
        console.error('🔍 调试 - 查询sessions表失败:', dbError);
      }

      return res.status(401).json({ success: false, message: '登录已过期，请重新登录' });
    }
    console.log('✅ authMiddleware - token有效, user_id:', session.user_id);

    // 检查是否是子账号登录
    if (session.sub_user_id) {
      // 子账号登录
      const subUser = await subUserDb.findById(session.sub_user_id);
      const parentUser = await userDb.findById(session.user_id);
      if (!subUser || !subUser.is_enabled) {
        return res.status(403).json({
          success: false,
          message: '账号已被禁用，请联系主账号管理员',
          parentEmail: parentUser?.email || null
        });
      }
      
      req.user = {
        id: session.sub_user_id,
        email: subUser.email,
        name: subUser.name,
        parentUserId: session.user_id,
        isSubUser: true,
        credits: parentUser?.credits || 0,
        apiKey: parentUser?.api_key || null
      };
    } else {
      // 主账号登录
      const user = await userDb.findById(session.user_id);
      
      if (!user || !user.is_enabled) {
        return res.status(403).json({ success: false, message: '账号已被禁用，请联系管理员 tailmart@163.com' });
      }
      
      req.user = {
        id: session.user_id,
        email: session.email,
        credits: user?.credits || 0,
        isSubUser: false,
        apiKey: user?.api_key || null
      };
    }
    next();
  };

  // 获取当前用户信息
  app.get("/api/auth/me", authMiddleware, async (req: any, res) => {
    try {
      let userId = req.user.id;
      let credits = req.user.credits;
      let isEnabled = true;

      // 如果是子账号，获取主账号的积分
      if (req.user.isSubUser && req.user.parentUserId) {
        userId = req.user.parentUserId;
        const parentUser = await userDb.findById(userId);
        if (parentUser) {
          credits = parentUser.credits;
          isEnabled = !!parentUser.is_enabled;

          // 配额模式下，子账号看到的是自己的剩余额度
          if (parentUser.sub_quota_mode === 'allocated') {
            const subUser = await subUserDb.findById(req.user.id);
            if (subUser) {
              const quotaLimit = Number(subUser.quota_limit || 0);
              const quotaConsumed = Number(subUser.quota_consumed || 0);
              credits = Math.max(0, quotaLimit - quotaConsumed);
            }
          }
        }
        const subUser = await subUserDb.findById(req.user.id);
        if (subUser) {
          isEnabled = !!subUser.is_enabled;
        }
      } else {
        const user = await userDb.findById(userId);
        if (user) {
          isEnabled = !!user.is_enabled;
        }
      }

      if (!isEnabled) {
        let parentEmail = null;
        if (req.user.isSubUser && req.user.parentUserId) {
          const parentUser = await userDb.findById(req.user.parentUserId);
          parentEmail = parentUser?.email || null;
        }
        return res.status(403).json({
          success: false,
          message: '账号已被禁用，请联系主账号管理员',
          parentEmail
        });
      }

      const user = await userDb.findById(userId);
      if (!user) {
        return res.status(404).json({ success: false, message: '用户不存在' });
      }
      res.json({
        success: true,
        user: {
          id: req.user.id,
          email: req.user.email,
          credits: credits,
          apiKey: user.api_key,
          isSubUser: req.user.isSubUser,
          parentUserId: req.user.parentUserId,
          quota_mode: user.sub_quota_mode || 'shared',
          recharge_disabled: !!user.recharge_disabled,
          is_agent: !!user.is_agent,
          is_admin: !!user.is_admin,
          applied_agent: !!user.applied_agent,
          invited_by: user.invited_by || null
        }
      });
    } catch (error: any) {
      console.error('Get user info error:', error);
      res.status(500).json({ success: false, message: '获取用户信息失败' });
    }
  });

  // 刷新用户积分 - 每次自动同步
  app.get("/api/auth/credits", authMiddleware, async (req: any, res) => {
    try {
      let userId = req.user.id;
      let isEnabled = true;

      // 如果是子账号，获取主账号的积分
      if (req.user.isSubUser && req.user.parentUserId) {
        userId = req.user.parentUserId;
        const subUser = await subUserDb.findById(req.user.id);
        if (subUser) {
          isEnabled = !!subUser.is_enabled;
        }
      } else {
        const user = await userDb.findById(userId);
        if (user) {
          isEnabled = !!user.is_enabled;
        }
      }

      if (!isEnabled) {
        let parentEmail = null;
        if (req.user.isSubUser && req.user.parentUserId) {
          const parentUser = await userDb.findById(req.user.parentUserId);
          parentEmail = parentUser?.email || null;
        }
        return res.status(403).json({
          success: false,
          message: '账号已被禁用，请联系主账号管理员',
          parentEmail
        });
      }

      const user = await userDb.findById(userId);
      if (!user) {
        return res.status(404).json({ success: false, message: '用户不存在' });
      }

      // 清理过期优惠券积分
      try {
        await creditBucketDb.cleanExpired(userId);
      } catch (e) {
        // 清理失败不影响主流程
      }

      // 重新获取清理后的余额
      const cleanedUser = await userDb.findById(userId);
      let displayCredits = cleanedUser?.credits ?? user.credits;

      // 配额模式下，子账号看到的是自己的剩余额度
      if (req.user.isSubUser && user.sub_quota_mode === 'allocated') {
        const subUser = await subUserDb.findById(req.user.id);
        if (subUser) {
          const quotaLimit = Number(subUser.quota_limit || 0);
          const quotaConsumed = Number(subUser.quota_consumed || 0);
          displayCredits = Math.max(0, quotaLimit - quotaConsumed);
        }
      }

      res.json({
        success: true,
        credits: displayCredits,
        quota_mode: user.sub_quota_mode || 'shared',
        recharge_disabled: !!user.recharge_disabled
      });
    } catch (error: any) {
      console.error('Get credits error:', error);
      res.status(500).json({ success: false, message: '获取积分失败' });
    }
  });

  // ==================== 支付相关配置 ====================
  const PAYMENT_CONFIG = {
    // 微信支付
    WX_APPID: '20211116018',
    WX_SECRET: '2c9a1f305a72088484e8e795b1972bfa',
    // 支付宝
    ALI_APPID: '20211115900',
    ALI_SECRET: '9a34b47e21803d472ab14c1d6da77e24',
    // 支付网关
    PAYMENT_API_URL: 'https://api.dpweixin.com/payment/do.html'
  };

  // 生成支付签名
  function getHash(params: any, appSecret: string): string {
    const sortedParams = Object.keys(params)
      .filter(key => params[key] && key !== 'hash')
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');
    const stringSignTemp = sortedParams + appSecret;
    return crypto.createHash('md5').update(stringSignTemp).digest('hex');
  }

  // 生成UUID
  function generateUUID(): string {
    return Date.now().toString(16).slice(0, 6) + '-' + Math.random().toString(16).slice(2, 8);
  }

  // 获取当前时间戳
  function getNowDate(): number {
    return Math.floor(new Date().valueOf() / 1000);
  }

  // 发起支付
  app.post("/api/payment/initiate", authMiddleware, async (req: any, res) => {
    try {
      const { amount, paymentMethod = 'wechat' } = req.body;
      const userId = req.user.id;
      const userEmail = req.user.email;

      // 子账号不能充值
      if (req.user.isSubUser) {
        return res.status(403).json({ success: false, message: '子账号不能充值，请使用主账号' });
      }

      // 检查用户是否被禁止充值
      const payingUser = await userDb.findById(req.user.isSubUser ? req.user.parentUserId : req.user.id);
      if (payingUser && payingUser.recharge_disabled) {
        return res.status(403).json({ success: false, message: '您的账号已被禁止充值，请联系管理员' });
      }

      if (!amount || amount <= 0) {
        return res.status(400).json({ success: false, message: '请输入有效的充值金额' });
      }

      // 生成订单号
      const orderId = `order_${userId}_${Date.now()}`;

      // 根据支付方式选择AppID和密钥
      const isAlipay = paymentMethod === 'alipay';
      const appId = isAlipay ? PAYMENT_CONFIG.ALI_APPID : PAYMENT_CONFIG.WX_APPID;
      const secret = isAlipay ? PAYMENT_CONFIG.ALI_SECRET : PAYMENT_CONFIG.WX_SECRET;

      const params: any = {
        version: '1.1',
        appid: appId,
        trade_order_id: orderId,
        total_fee: amount,
        title: `Softhooky 积分充值 - ¥${amount}`,
        time: getNowDate(),
        notify_url: `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/payment/notify`,
        return_url: `${process.env.FRONTEND_URL?.split(',')[0] || 'https://softhooky.com'}/payment-success.html`,
        nonce_str: generateUUID(),
        type: 'WAP',
        wap_url: 'https://softhooky.com',
        wap_name: 'Softhooky'
      };

      // 生成签名
      params.hash = getHash(params, secret);

      console.log('📤 发起支付请求:', { orderId, amount, userId, paymentMethod });

      // 将参数转换为URLSearchParams格式
      const requestParams = new URLSearchParams();
      Object.keys(params).forEach(key => {
        requestParams.append(key, params[key]);
      });

      // 请求支付网关
      let paymentUrl = null;
      try {
        const response = await axios.post(PAYMENT_CONFIG.PAYMENT_API_URL, requestParams, {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: 15000
        });

        console.log('✅ 支付网关响应:', response.data);
        paymentUrl = response.data.url || response.data.payurl;
      } catch (paymentError: any) {
        console.error('❌ 支付网关请求失败:', paymentError.message);
        // 即使支付网关失败，也要更新积分（因为用户已经支付了）
        paymentUrl = null;
      }

      // 保存订单信息到数据库（状态为 pending，等支付回调确认）
      await pool.execute(
        'INSERT INTO payment_orders (user_id, order_id, amount, status, created_at) VALUES (?, ?, ?, ?, NOW())',
        [userId, orderId, amount, 'pending']
      );

      console.log('✅ 订单已创建，等待支付回调:', { orderId, userId, amount });

      // 如果支付网关失败，返回错误
      if (!paymentUrl) {
        console.error('❌ 支付网关未返回支付URL');
        // 更新订单状态为失败
        await pool.execute(
          'UPDATE payment_orders SET status = ? WHERE order_id = ?',
          ['failed', orderId]
        );
        return res.status(400).json({
          success: false,
          message: '支付网关响应异常，请稍后重试'
        });
      }

      res.json({
        success: true,
        orderId,
        paymentUrl,
        amount,
        paymentMethod
      });
    } catch (error: any) {
      console.error('❌ 支付请求失败:', error.message);
      res.status(500).json({
        success: false,
        message: '支付请求失败，请稍后重试'
      });
    }
  });

  // 测试回调是否可达
  app.get("/api/payment/test-notify", (req, res) => {
    console.log('🔔 测试回调被访问');
    res.json({ success: true, message: '回调端点正常', time: new Date() });
  });

  // 测试 POST 回调
  app.post("/api/payment/test-notify", express.urlencoded({ extended: true }), (req, res) => {
    console.log('🔔 测试 POST 回调被访问');
    console.log('📥 收到数据:', req.body);
    res.send('success');
  });

  // 手动处理 pending 订单（用于调试）
  app.post("/api/payment/manual-process", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user.isSubUser ? req.user.parentUserId : req.user.id;
      console.log('🔧 手动处理 pending 订单，用户ID:', userId);

      const [pendingOrders] = await pool.execute(
        `SELECT * FROM payment_orders
         WHERE user_id = ? AND status = "pending"
         ORDER BY created_at DESC LIMIT 10`,
        [userId]
      );

      if (!pendingOrders || (pendingOrders as any[]).length === 0) {
        return res.json({ success: true, message: '没有 pending 订单' });
      }

      let processed = 0;
      for (const order of pendingOrders as any[]) {
        const amount = parseFloat(order.amount);
        const user = await userDb.findById(userId);
        if (!user) continue;

        const currentCredits = parseFloat(user.credits) || 0;
        const newCredits = currentCredits + amount;

        await pool.execute('UPDATE users SET credits = ? WHERE id = ?', [newCredits, userId]);
        await pool.execute(
          'INSERT INTO credit_buckets (user_id, total_amount, remaining_amount, source, expires_at) VALUES (?, ?, ?, ?, NULL)',
          [userId, amount, amount, 'recharge']
        );
        await pool.execute(
          'INSERT INTO credit_transactions (user_id, amount, type, description, created_at) VALUES (?, ?, ?, ?, NOW())',
          [userId, amount, 'recharge', `手动处理 - 订单号: ${order.order_id}`]
        );
        await pool.execute(
          'UPDATE payment_orders SET status = ?, updated_at = NOW() WHERE order_id = ?',
          ['completed', order.order_id]
        );

        processed++;
        console.log('✅ 手动处理订单:', order.order_id, '金额:', amount);
      }

      res.json({ success: true, message: `已处理 ${processed} 个订单` });
    } catch (error: any) {
      console.error('手动处理失败:', error);
      res.status(500).json({ success: false, message: '处理失败' });
    }
  });

  // 检查支付状态（用于前端轮询）
  app.post("/api/payment/check-status", authMiddleware, async (req: any, res) => {
    try {
      const { startTime } = req.body;
      const userId = req.user.isSubUser ? req.user.parentUserId : req.user.id;
      
      // 查询该用户最新的已完成订单
      const [orders] = await pool.execute(
        'SELECT * FROM payment_orders WHERE user_id = ? AND status = "completed" ORDER BY created_at DESC LIMIT 1',
        [userId]
      );
      
      if (!orders || (orders as any[]).length === 0) {
        return res.json({ success: true, paid: false });
      }
      
      const order = (orders as any[])[0];
      
      // 如果订单创建时间在支付开始之后，认为已支付
      if (startTime && new Date(order.created_at).getTime() > startTime) {
        return res.json({ success: true, paid: true, order });
      }
      
      return res.json({ success: true, paid: false });
    } catch (error: any) {
      console.error('Check status error:', error);
      res.status(500).json({ success: false, message: '检查状态失败' });
    }
  });

  // 查询订单状态（用于前端轮询）
  app.get("/api/payment/order/:orderId", authMiddleware, async (req: any, res) => {
    try {
      const orderId = req.params.orderId;
      const userId = req.user.isSubUser ? req.user.parentUserId : req.user.id;
      
      const [orders] = await pool.execute(
        'SELECT * FROM payment_orders WHERE order_id = ? AND user_id = ?',
        [orderId, userId]
      );
      
      if (!orders || (orders as any[]).length === 0) {
        return res.status(404).json({ success: false, message: '订单不存在' });
      }
      
      const order = (orders as any[])[0];
      res.json({ success: true, order });
    } catch (error: any) {
      console.error('查询订单失败:', error);
      res.status(500).json({ success: false, message: '查询订单失败' });
    }
  });

  // 支付回调处理
  app.post("/api/payment/notify", express.urlencoded({ extended: true }), async (req: any, res) => {
    try {
      const data = req.body;
      console.log('📥 收到支付回调 ==================');
      console.log('📥 原始数据:', JSON.stringify(data));
      console.log('📥 请求头:', JSON.stringify(req.headers));

      // 根据appid判断支付方式
      const isAlipay = data.appid === PAYMENT_CONFIG.ALI_APPID;
      const secret = isAlipay ? PAYMENT_CONFIG.ALI_SECRET : PAYMENT_CONFIG.WX_SECRET;
      const paymentMethod = isAlipay ? '支付宝' : '微信支付';
      console.log('💳 支付方式:', paymentMethod, '(AppID:', data.appid, ')');

      // 验签 - 必须通过才能处理
      const expectedHash = getHash(data, secret);
      console.log('🔐 签名验证:');
      console.log('   收到:', data.hash);
      console.log('   期望:', expectedHash);
      console.log('   匹配:', data.hash === expectedHash ? '✅' : '❌');

      const signatureValid = data.hash === expectedHash;
      if (!signatureValid) {
        console.error('❌ 签名验证失败，拒绝处理订单');
        return res.status(403).send('signature_invalid');
      }

      // 检查支付状态
      console.log('📊 支付状态:', data.status, '(期望: OD)');
      if (data.status !== 'OD') {
        console.log('⏳ 支付状态不是已完成，跳过处理');
        return res.send('success');
      }

      const orderId = data.trade_order_id;
      console.log('📋 处理订单:', orderId);

      // 查询订单信息（所有状态的都查出来）
      const [allOrders] = await pool.execute(
        'SELECT * FROM payment_orders WHERE order_id = ?',
        [orderId]
      );
      console.log('📋 找到订单:', allOrders);

      if (!allOrders || (allOrders as any[]).length === 0) {
        console.error('❌ 订单不存在:', orderId);
        return res.send('success');
      }

      const existingOrder = (allOrders as any[])[0];
      console.log('📋 订单当前状态:', existingOrder.status);

      // 如果订单已经是 completed 状态，跳过处理
      if (existingOrder.status === 'completed') {
        console.log('✅ 订单已经是 completed 状态，跳过处理');
        return res.send('success');
      }

      // 获取用户信息和积分
      const userId = existingOrder.user_id;
      const amount = parseFloat(existingOrder.amount);
      console.log('📋 订单详情:', { userId, amount, orderId, currentStatus: existingOrder.status });

      const user = await userDb.findById(userId);
      if (!user) {
        console.error('❌ 用户不存在:', userId);
        return res.send('fail');
      }

      // 更新用户积分 - 使用绝对加法确保正确
      const currentCredits = parseFloat(user.credits) || 0;
      const newCredits = currentCredits + amount;
      console.log('💰 更新积分:', { currentCredits, amount, newCredits });

      await pool.execute('UPDATE users SET credits = ? WHERE id = ?', [newCredits, userId]);
      await pool.execute(
        'INSERT INTO credit_buckets (user_id, total_amount, remaining_amount, source, expires_at) VALUES (?, ?, ?, ?, NULL)',
        [userId, amount, amount, 'recharge']
      );

      // 验证积分是否更新成功
      const [verifyUser] = await pool.execute('SELECT credits FROM users WHERE id = ?', [userId]);
      const updatedCredits = (verifyUser as any[])[0]?.credits;
      console.log('✅ 积分更新验证:', updatedCredits);

      // 记录交易
      await pool.execute(
        'INSERT INTO credit_transactions (user_id, amount, type, description, created_at) VALUES (?, ?, ?, ?, NOW())',
        [userId, amount, 'recharge', `${paymentMethod}充值${signatureValid ? '' : '(验签失败)'} - 订单号: ${orderId}`]
      );

      // 更新订单状态为 completed
      await pool.execute(
        'UPDATE payment_orders SET status = ?, updated_at = NOW() WHERE order_id = ?',
        ['completed', orderId]
      );

      console.log('✅ 充值成功:', {
        userId,
        amount,
        previousCredits: currentCredits,
        newCredits,
        orderId,
        previousStatus: existingOrder.status,
        newStatus: 'completed',
        paymentMethod,
        signatureValid
      });

      res.send('success');
    } catch (error: any) {
      console.error('❌ 支付回调处理失败:', error.message);
      console.error('❌ 错误堆栈:', error.stack);
      res.send('fail');
    }
  });

  // 充值积分
  app.post("/api/auth/recharge", authMiddleware, async (req: any, res) => {
    const { amount } = req.body;
    
    // 只有主账号可以充值
    if (req.user.isSubUser) {
      return res.status(403).json({ success: false, message: '子账号无权限充值' });
    }
    
    const userId = req.user.id;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: '请输入有效的充值金额' });
    }

    try {
      await creditTransactionDb.create(userId, amount, 'recharge', '积分充值');
      await userDb.updateCredits(userId, (await userDb.findById(userId)).credits + amount);
      await pool.execute(
        'INSERT INTO credit_buckets (user_id, total_amount, remaining_amount, source, expires_at) VALUES (?, ?, ?, ?, NULL)',
        [userId, amount, amount, 'recharge']
      );

      // 充值佣金：充值不涉及具体服务，佣金在消费时按代理差价计算
      // 此处不再发放充值佣金

      const updatedUser = await userDb.findById(userId);

      res.json({
        success: true,
        credits: updatedUser.credits,
        message: '充值成功'
      });
    } catch (error: any) {
      console.error('Recharge error:', error);
      res.status(500).json({ success: false, message: '充值失败，请稍后重试' });
    }
  });

  // 同步用户积分 - 只做差异补录，不自动处理 pending 订单
  app.post("/api/payment/sync-credits", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user.isSubUser ? req.user.parentUserId : req.user.id;

      console.log('🔧 sync-credits 调用，用户ID:', userId);

      // 查询已完成的订单（24小时内）
      const [ordersResult] = await pool.execute(
        `SELECT SUM(CAST(amount AS DECIMAL(10,2))) as total FROM payment_orders
         WHERE user_id = ? AND status = "completed"
         AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
        [userId]
      );
      const ordersTotal = parseFloat((ordersResult as any[])[0]?.total?.toString() || '0');

      // 查询已同步的交易（24小时内）
      const [transResult] = await pool.execute(
        `SELECT SUM(CAST(amount AS DECIMAL(10,2))) as total FROM credit_transactions
         WHERE user_id = ? AND type = "recharge"
         AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
        [userId]
      );
      const transTotal = parseFloat((transResult as any[])[0]?.total?.toString() || '0');

      // 计算差异并补录
      const diff = ordersTotal - transTotal;
      console.log('📋 订单总额:', ordersTotal, '交易总额:', transTotal, '差异:', diff);

      if (diff > 0.01) {
        const [userResult] = await pool.execute('SELECT credits FROM users WHERE id = ?', [userId]);
        const currentCredits = parseFloat((userResult as any[])[0]?.credits?.toString() || '0');
        const newCredits = currentCredits + diff;

        await pool.execute(
          'INSERT INTO credit_transactions (user_id, amount, type, description, created_at) VALUES (?, ?, ?, ?, NOW())',
          [userId, diff, 'recharge', `积分同步补录 - 金额: ${diff}`]
        );
        await pool.execute('UPDATE users SET credits = ? WHERE id = ?', [newCredits, userId]);
        await pool.execute(
          'INSERT INTO credit_buckets (user_id, total_amount, remaining_amount, source, expires_at) VALUES (?, ?, ?, ?, NULL)',
          [userId, diff, diff, 'recharge']
        );
        console.log('✅ 补录积分:', diff);

        res.json({
          success: true,
          message: `已补录 ${diff} 积分`,
          synced: 1,
          totalAmount: diff
        });
      } else {
        res.json({
          success: true,
          message: '积分已是最新',
          synced: 0,
          totalAmount: 0
        });
      }
    } catch (error: any) {
      console.error('同步积分失败:', error);
      res.status(500).json({ success: false, message: '同步积分失败' });
    }
  });

  // 手动完成订单（用于测试或手动处理支付）
  app.post("/api/payment/manual-complete", authMiddleware, async (req: any, res) => {
    try {
      const { orderId } = req.body;
      const userId = req.user.isSubUser ? req.user.parentUserId : req.user.id;
      
      if (!orderId) {
        return res.status(400).json({ success: false, message: '请提供订单号' });
      }
      
      // 查询订单
      const [orders] = await pool.execute(
        'SELECT * FROM payment_orders WHERE order_id = ? AND user_id = ?',
        [orderId, userId]
      );
      
      if (!orders || (orders as any[]).length === 0) {
        return res.status(404).json({ success: false, message: '订单不存在' });
      }
      
      const order = (orders as any[])[0];
      
      if (order.status === 'completed') {
        return res.json({ success: true, message: '订单已完成，无需处理' });
      }
      
      const amount = parseFloat(order.amount);
      
      // 获取用户当前积分
      const user = await userDb.findById(userId);
      if (!user) {
        return res.status(404).json({ success: false, message: '用户不存在' });
      }
      
      const currentCredits = parseFloat(user.credits) || 0;
      const newCredits = currentCredits + amount;
      
      // 更新积分
      await pool.execute('UPDATE users SET credits = ? WHERE id = ?', [newCredits, userId]);
      await pool.execute(
        'INSERT INTO credit_buckets (user_id, total_amount, remaining_amount, source, expires_at) VALUES (?, ?, ?, ?, NULL)',
        [userId, amount, amount, 'recharge']
      );
      
      // 创建交易记录
      await pool.execute(
        'INSERT INTO credit_transactions (user_id, amount, type, description, created_at) VALUES (?, ?, ?, ?, NOW())',
        [userId, amount, 'recharge', `手动完成充值 - 订单号: ${orderId}`]
      );
      
      // 更新订单状态
      await pool.execute(
        'UPDATE payment_orders SET status = ?, updated_at = NOW() WHERE order_id = ?',
        ['completed', orderId]
      );
      
      console.log('✅ 手动完成订单:', { orderId, userId, amount, currentCredits, newCredits });
      
      res.json({
        success: true,
        message: '订单已完成',
        order: {
          orderId,
          amount,
          previousCredits: currentCredits,
          newCredits
        }
      });
    } catch (error: any) {
      console.error('手动完成订单失败:', error);
      res.status(500).json({ success: false, message: '处理失败' });
    }
  });

  // 自动修复待处理订单（只处理最近30分钟的pending订单）
  app.post("/api/payment/fix-pending", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user.isSubUser ? req.user.parentUserId : req.user.id;
      
      console.log('🔧 fix-pending 调用，用户ID:', userId);
      
      // 查询最近30分钟内的待处理订单（用户可能还在支付中）
      const [pendingOrders] = await pool.execute(
        `SELECT * FROM payment_orders 
         WHERE user_id = ? AND status = 'pending' 
         AND created_at > DATE_SUB(NOW(), INTERVAL 30 MINUTE)
         ORDER BY created_at DESC`,
        [userId]
      );
      
      const orders = pendingOrders as any[];
      console.log('📋 最近30分钟待处理订单:', orders.length);
      
      if (orders.length === 0) {
        return res.json({ success: true, message: '没有待处理订单', fixed: 0 });
      }
      
      // 获取用户当前积分
      const [userResult] = await pool.execute('SELECT credits FROM users WHERE id = ?', [userId]);
      const currentCredits = parseFloat((userResult as any[])[0]?.credits?.toString() || '0');
      
      let fixedCount = 0;
      let totalAmount = 0;
      
      for (const order of orders) {
        const amount = parseFloat(order.amount?.toString() || '0');
        totalAmount += amount;
        
        console.log(`💰 处理订单: ${order.order_id}, 金额: ${amount}`);
        
        // 创建交易记录
        await pool.execute(
          'INSERT INTO credit_transactions (user_id, amount, type, description, created_at) VALUES (?, ?, ?, ?, NOW())',
          [userId, amount, 'recharge', `自动修复充值 - 订单号: ${order.order_id}`]
        );
        
        // 更新订单状态
        await pool.execute(
          'UPDATE payment_orders SET status = ?, updated_at = NOW() WHERE order_id = ?',
          ['completed', order.order_id]
        );
        
        fixedCount++;
      }
      
      // 更新用户积分
      if (totalAmount > 0) {
        const newCredits = currentCredits + totalAmount;
        console.log(`💾 更新积分: ${currentCredits} + ${totalAmount} = ${newCredits}`);
        await pool.execute('UPDATE users SET credits = ? WHERE id = ?', [newCredits, userId]);
        await pool.execute(
          'INSERT INTO credit_buckets (user_id, total_amount, remaining_amount, source, expires_at) VALUES (?, ?, ?, ?, NULL)',
          [userId, totalAmount, totalAmount, 'recharge']
        );
        
        // 验证更新
        const [verifyResult] = await pool.execute('SELECT credits FROM users WHERE id = ?', [userId]);
        console.log('✅ 验证积分:', (verifyResult as any[])[0]?.credits);
      }
      
      res.json({
        success: true,
        message: `已修复 ${fixedCount} 个订单`,
        fixed: fixedCount,
        totalAmount
      });
    } catch (error: any) {
      console.error('修复待处理订单失败:', error);
      res.status(500).json({ success: false, message: '修复失败' });
    }
  });

  // 确认支付并更新积分
  app.post("/api/payment/confirm", authMiddleware, async (req: any, res) => {
    try {
      const { orderId } = req.body;
      const userId = req.user.id;

      if (!orderId) {
        return res.status(400).json({ success: false, message: '订单号不能为空' });
      }

      // 查询订单信息
      const [orders] = await pool.execute(
        'SELECT * FROM payment_orders WHERE order_id = ? AND user_id = ?',
        [orderId, userId]
      );

      if (!orders || (orders as any[]).length === 0) {
        return res.status(400).json({ success: false, message: '订单不存在' });
      }

      const order = (orders as any[])[0];

      // 如果订单已经完成，直接返回成功
      if (order.status === 'completed') {
        console.log('✅ 订单已完成，直接返回:', orderId);
        return res.json({ success: true, message: '支付已确认' });
      }

      // 如果订单还是pending，更新为completed并增加积分
      if (order.status === 'pending') {
        const amount = order.amount;
        const user = await userDb.findById(userId);
        const currentCredits = parseFloat(user?.credits) || 0;
        const newCredits = currentCredits + amount;

        // 更新用户积分
        await userDb.updateCredits(userId, newCredits);
        await pool.execute(
          'INSERT INTO credit_buckets (user_id, total_amount, remaining_amount, source, expires_at) VALUES (?, ?, ?, ?, NULL)',
          [userId, amount, amount, 'recharge']
        );

        // 记录交易
        await creditTransactionDb.create(userId, amount, 'recharge', `支付充值 - 订单号: ${orderId}`);

        // 更新订单状态
        await pool.execute(
          'UPDATE payment_orders SET status = ? WHERE order_id = ?',
          ['completed', orderId]
        );

        console.log('✅ 支付已确认，积分已更新:', {
          userId,
          amount,
          previousCredits: currentCredits,
          newCredits,
          orderId
        });

        res.json({ success: true, message: '支付已确认' });
      } else {
        res.status(400).json({ success: false, message: '订单状态异常' });
      }
    } catch (error: any) {
      console.error('确认支付失败:', error);
      res.status(500).json({ success: false, message: '确认支付失败' });
    }
  });

  // 修复待处理订单（将待处理订单改为已完成并更新积分）
  app.post("/api/payment/fix-pending", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user.id;
      console.log('🔧 开始修复待处理订单，用户ID:', userId);

      // 查询该用户所有待处理的订单
      const [pendingOrders] = await pool.execute(
        'SELECT * FROM payment_orders WHERE user_id = ? AND status = ?',
        [userId, 'pending']
      );

      console.log('📋 查询到待处理订单:', (pendingOrders as any[])?.length || 0);

      if (!pendingOrders || (pendingOrders as any[]).length === 0) {
        console.log('✅ 没有待处理的订单');
        return res.json({ success: true, message: '没有待处理的订单', fixed: 0 });
      }

      let totalAmount = 0;
      const user = await userDb.findById(userId);
      let currentCredits = parseFloat(user?.credits?.toString() || '0');
      
      console.log('💰 当前积分:', currentCredits);

      // 处理每个待处理的订单
      for (const order of pendingOrders as any[]) {
        const amount = parseFloat(order.amount?.toString() || '0');
        totalAmount += amount;
        
        console.log(`📝 处理订单 ${order.order_id}，金额: ¥${amount}`);

        // 更新订单状态
        await pool.execute(
          'UPDATE payment_orders SET status = ? WHERE order_id = ?',
          ['completed', order.order_id]
        );

        // 记录交易
        await creditTransactionDb.create(userId, amount, 'recharge', `支付充值 - 订单号: ${order.order_id}`);
      }

      // 一次性更新用户积分
      const newCredits = currentCredits + totalAmount;
      console.log(`💾 更新积分: ${currentCredits} + ${totalAmount} = ${newCredits}`);
      await userDb.updateCredits(userId, newCredits);
      
      // 验证积分是否真的被更新了
      const updatedUser = await userDb.findById(userId);
      console.log('✅ 积分更新后验证:', updatedUser?.credits);

      console.log('✅ 修复完成:', {
        userId,
        fixedCount: (pendingOrders as any[]).length,
        totalAmount,
        previousCredits: currentCredits,
        newCredits,
        verifiedCredits: updatedUser?.credits
      });

      res.json({
        success: true,
        message: '订单已修复',
        fixed: (pendingOrders as any[]).length,
        totalAmount,
        newCredits
      });
    } catch (error: any) {
      console.error('❌ 修复订单失败:', error);
      res.status(500).json({ success: false, message: '修复订单失败' });
    }
  });

  // 直接修复所有待处理订单（管理员用）
  app.post("/api/payment/admin-fix-all", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user.id;

      // 获取该用户的所有待处理订单
      const [pendingOrders] = await pool.execute(
        'SELECT * FROM payment_orders WHERE user_id = ? AND status = "pending"',
        [userId]
      );

      if (!pendingOrders || (pendingOrders as any[]).length === 0) {
        return res.json({ success: true, message: '没有待处理的订单' });
      }

      const orders = pendingOrders as any[];
      let totalAmount = 0;

      // 更新所有订单状态为已完成
      for (const order of orders) {
        await pool.execute(
          'UPDATE payment_orders SET status = "completed" WHERE order_id = ?',
          [order.order_id]
        );
        totalAmount += order.amount;
      }

      // 获取用户当前积分
      const user = await userDb.findById(userId);
      const currentCredits = parseFloat(user?.credits) || 0;
      const newCredits = currentCredits + totalAmount;

      // 更新用户积分
      await userDb.updateCredits(userId, newCredits);

      // 为每个订单记录交易
      for (const order of orders) {
        await creditTransactionDb.create(userId, order.amount, 'recharge', `支付充值 - 订单号: ${order.order_id}`);
      }

      console.log('✅ 管理员修复完成:', {
        userId,
        fixedCount: orders.length,
        totalAmount,
        previousCredits: currentCredits,
        newCredits
      });

      res.json({
        success: true,
        message: '所有待处理订单已修复',
        fixed: orders.length,
        totalAmount,
        newCredits
      });
    } catch (error: any) {
      console.error('管理员修复失败:', error);
      res.status(500).json({ success: false, message: '修复失败' });
    }
  });

  // 手动更新特定订单状态（管理员用）
  app.post("/api/payment/admin-update-order", authMiddleware, async (req: any, res) => {
    try {
      const { orderId, status } = req.body;
      const userId = req.user.id;

      if (!orderId || !status) {
        return res.status(400).json({ success: false, message: '订单号和状态不能为空' });
      }

      // 查询订单信息
      const [orders] = await pool.execute(
        'SELECT * FROM payment_orders WHERE order_id = ? AND user_id = ?',
        [orderId, userId]
      );

      if (!orders || (orders as any[]).length === 0) {
        return res.status(400).json({ success: false, message: '订单不存在' });
      }

      const order = (orders as any[])[0];
      const previousStatus = order.status;

      // 如果从pending改为completed，需要增加积分
      if (previousStatus === 'pending' && status === 'completed') {
        const amount = order.amount;
        const user = await userDb.findById(userId);
        const currentCredits = parseFloat(user?.credits) || 0;
        const newCredits = currentCredits + amount;

        // 更新用户积分
        await userDb.updateCredits(userId, newCredits);

        // 记录交易
        await creditTransactionDb.create(userId, amount, 'recharge', `支付充值 - 订单号: ${orderId}`);

        console.log('✅ 订单已手动更新:', {
          userId,
          orderId,
          amount,
          previousCredits: currentCredits,
          newCredits,
          previousStatus,
          newStatus: status
        });
      }

      // 更新订单状态
      await pool.execute(
        'UPDATE payment_orders SET status = ? WHERE order_id = ?',
        [status, orderId]
      );

      res.json({
        success: true,
        message: '订单已更新',
        orderId,
        previousStatus,
        newStatus: status
      });
    } catch (error: any) {
      console.error('更新订单失败:', error);
      res.status(500).json({ success: false, message: '更新订单失败' });
    }
  });

  // 同步已完成订单的积分（处理那些标记为completed但还没加积分的订单）
  app.post("/api/payment/sync-credits", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user.id;

      // 查询所有已完成的订单
      const [completedOrders] = await pool.execute(
        'SELECT * FROM payment_orders WHERE user_id = ? AND status = "completed" ORDER BY created_at ASC',
        [userId]
      );

      if (!completedOrders || (completedOrders as any[]).length === 0) {
        return res.json({ success: true, message: '没有已完成的订单', synced: 0, totalAmount: 0 });
      }

      // 查询已记录的交易
      const [transactions] = await pool.execute(
        'SELECT description FROM credit_transactions WHERE user_id = ? AND type = "recharge"',
        [userId]
      );

      const transactionDescriptions = new Set((transactions as any[]).map(t => t.description));

      let totalAmount = 0;
      const user = await userDb.findById(userId);
      let currentCredits = user?.credits || 0;
      let syncedCount = 0;

      // 处理每个已完成但还没加积分的订单
      for (const order of completedOrders as any[]) {
        const transactionDesc = `支付充值 - 订单号: ${order.order_id}`;
        
        // 如果这个订单的交易还没记录，就添加
        if (!transactionDescriptions.has(transactionDesc)) {
          const amount = order.amount;
          totalAmount += amount;
          syncedCount++;

          // 记录交易
          await creditTransactionDb.create(userId, amount, 'recharge', transactionDesc);
        }
      }

      // 一次性更新用户积分
      if (syncedCount > 0) {
        const newCredits = currentCredits + totalAmount;
        await userDb.updateCredits(userId, newCredits);

        console.log('✅ 积分同步完成:', {
          userId,
          syncedCount,
          totalAmount,
          previousCredits: currentCredits,
          newCredits
        });

        res.json({
          success: true,
          message: '积分已同步',
          synced: syncedCount,
          totalAmount,
          newCredits
        });
      } else {
        res.json({
          success: true,
          message: '所有订单积分已同步',
          synced: 0,
          totalAmount: 0
        });
      }
    } catch (error: any) {
      console.error('同步积分失败:', error);
      res.status(500).json({ success: false, message: '同步积分失败' });
    }
  });

  // 获取充值记录
  app.get("/api/payment/records", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user.isSubUser ? req.user.parentUserId : req.user.id;
      
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const pageSize = 15;
      const offset = (page - 1) * pageSize;

      // 顺序执行查询
      const ordersResult = await pool.execute(
        'SELECT id, order_id, amount, status, created_at FROM payment_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
        [userId, pageSize, offset]
      );
      const countResult = await pool.execute(
        'SELECT COUNT(*) as total FROM payment_orders WHERE user_id = ?',
        [userId]
      );
      const statsResult = await pool.execute(
        'SELECT SUM(amount) as total_amount, COUNT(*) as total_count FROM payment_orders WHERE user_id = ? AND status = "completed"',
        [userId]
      );

      console.log('=== DEBUG ===');
      console.log('ordersResult[0]:', ordersResult[0]);
      console.log('countResult[0]:', countResult[0]);
      console.log('countResult[0][0]:', countResult[0]?.[0]);
      console.log('statsResult[0]:', statsResult[0]);
      console.log('=============');

      const ordersData = ordersResult[0] as any[];
      const totalOrders = Array.isArray(countResult[0]) && countResult[0].length > 0 ? (countResult[0][0] as any).total : 0;
      const stats = Array.isArray(statsResult[0]) && statsResult[0].length > 0 ? statsResult[0][0] as any : { total_amount: 0, total_count: 0 };
      
      res.json({
        success: true,
        orders: ordersData || [],
        pagination: {
          page,
          pageSize,
          totalOrders,
          totalPages: Math.ceil(totalOrders / pageSize)
        },
        stats: {
          totalAmount: stats.total_amount || 0,
          totalCount: stats.total_count || 0,
          averageAmount: stats.total_count > 0 ? (stats.total_amount / stats.total_count).toFixed(2) : 0
        }
      });
    } catch (error: any) {
      console.error('Get payment records error:', error);
      res.status(500).json({ success: false, message: '获取充值记录失败' });
    }
});
  // 获取消费记录
  app.get("/api/payment/consumption", authMiddleware, async (req: any, res) => {
    try {
      let userId = req.user.id;
      let isSubUser = false;
      
      if (req.user.isSubUser && req.user.parentUserId) {
        userId = req.user.parentUserId;
        isSubUser = true;
      }

      const page = Math.max(1, parseInt(req.query.page) || 1);
      const pageSize = 10;
      const offset = (page - 1) * pageSize;

      const userResult = await pool.execute('SELECT credits, sub_quota_mode FROM users WHERE id = ?', [userId]);
      let currentCredits = parseFloat(userResult[0]?.[0]?.credits || 0);
      const quotaMode = userResult[0]?.[0]?.sub_quota_mode || 'shared';

      // 配额模式下，子账号看到的余额是自己的剩余额度
      if (isSubUser && quotaMode === 'allocated') {
        const subUser = await subUserDb.findById(req.user.id);
        if (subUser) {
          const quotaLimit = Number(subUser.quota_limit || 0);
          const quotaConsumed = Number(subUser.quota_consumed || 0);
          currentCredits = Math.max(0, quotaLimit - quotaConsumed);
        }
      }

      const CREDIT_MAP: Record<string, number> = {
        'generate': 0.3, 'edit': 0.3, 'refine': 0.3,
        'product_fusion': 0.3, 'grid_merge': 0.3, 'image': 0.3,
        'video': 1.5, 'deduct': 0.03
      };
      
      const getCreditAmount = (type: string, amount: number): number => {
        if (amount > 0) return amount;
        return CREDIT_MAP[type] || 0.3;
      };

      const getDescription = (type: string): string => {
        const DESC_MAP: Record<string, string> = {
          'generate': '图片生成', 'edit': '图片编辑', 'refine': '图片优化',
          'product_fusion': '产品融图', 'grid_merge': '宫格合并',
          'image': '图片生成', 'video': '视频生成', 'deduct': '反推提示词'
        };
        return DESC_MAP[type] || '消费';
      };

      let query = '';
      let countQuery = '';
      
      if (isSubUser) {
        query = 'SELECT ct.*, u.name as sub_user_name FROM credit_transactions ct LEFT JOIN sub_users u ON ct.sub_user_id = u.id WHERE ct.sub_user_id = ? AND ct.type != "recharge" ORDER BY ct.created_at DESC LIMIT ? OFFSET ?';
        countQuery = 'SELECT COUNT(*) as total FROM credit_transactions WHERE sub_user_id = ? AND type != "recharge"';
      } else {
        query = 'SELECT ct.*, u.name as sub_user_name FROM credit_transactions ct LEFT JOIN sub_users u ON ct.sub_user_id = u.id WHERE (ct.parent_user_id = ? OR (ct.user_id = ? AND ct.type != "recharge")) ORDER BY ct.created_at DESC LIMIT ? OFFSET ?';
        countQuery = 'SELECT COUNT(*) as total FROM credit_transactions WHERE parent_user_id = ? OR (user_id = ? AND type != "recharge")';
      }
      
      const queryParams = isSubUser ? [req.user.id, pageSize, offset] : [userId, userId, pageSize, offset];
      const countParams = isSubUser ? [req.user.id] : [userId, userId];

      const consumptionsResult = await pool.execute(query, queryParams);
      const countResult = await pool.execute(countQuery, countParams);

      let allQuery = '';
      if (isSubUser) {
        allQuery = 'SELECT ct.* FROM credit_transactions ct WHERE ct.sub_user_id = ? AND ct.type != "recharge" ORDER BY ct.created_at ASC';
      } else {
        allQuery = 'SELECT ct.* FROM credit_transactions ct WHERE (ct.parent_user_id = ? OR (ct.user_id = ? AND ct.type != "recharge")) ORDER BY ct.created_at ASC';
      }
      const allRecordsResult = await pool.execute(allQuery, isSubUser ? [req.user.id] : [userId, userId]);
      
      let calcCredits = currentCredits;
      const creditMap: Record<number, number> = {};
      
      const sortedRecords = ((allRecordsResult[0] as any[]) || []).sort((a: any, b: any) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      
      for (const rec of sortedRecords) {
        const amount = getCreditAmount(rec.type, Math.abs(parseFloat(rec.amount)));
        creditMap[rec.id] = calcCredits;
        calcCredits -= amount;
      }

      const consumptionsData = ((consumptionsResult[0] as any[]) || []).map((c: any) => {
        const amount = getCreditAmount(c.type, Math.abs(parseFloat(c.amount)));
        const beforeCredits = creditMap[c.id] || currentCredits;
        return {
          ...c,
          amount: -amount,
          beforeCredits: beforeCredits,
          afterCredits: beforeCredits - amount,
          description: c.description || getDescription(c.type)
        };
      });

      const totalConsumptions = Array.isArray(countResult[0]) && countResult[0].length > 0 ? (countResult[0][0] as any).total : 0;

      res.json({
        success: true,
        consumptions: consumptionsData,
        pagination: {
          page,
          pageSize,
          totalConsumptions,
          totalPages: Math.ceil(totalConsumptions / pageSize)
        },
        stats: { currentCredits: currentCredits }
      });
    } catch (error: any) {
      console.error('Get consumption records error:', error);
      res.status(500).json({ success: false, message: '获取消费记录失败' });
    }
  });

  // 清理虚拟支付数据（仅保留真实充值）
  app.post("/api/payment/cleanup", authMiddleware, async (req: any, res) => {
    try {
      // 只有主账号可以清理数据
      if (req.user.isSubUser) {
        return res.status(403).json({ success: false, message: '子账号无权限' });
      }

      const userId = req.user.id;

      // 1. 删除所有 pending 状态的订单
      const [deleteOrdersResult] = await pool.execute(
        'DELETE FROM payment_orders WHERE user_id = ? AND status = "pending"',
        [userId]
      );
      const deletedOrders = (deleteOrdersResult as any).affectedRows || 0;

      // 2. 获取所有虚拟交易（除了 ¥1.00 的）
      const [virtualTransactions] = await pool.execute(
        'SELECT id FROM credit_transactions WHERE user_id = ? AND type = "recharge" AND amount != 1.00',
        [userId]
      );
      const virtualIds = (virtualTransactions as any[]).map(t => t.id);

      let deletedTransactions = 0;
      if (virtualIds.length > 0) {
        const placeholders = virtualIds.map(() => '?').join(',');
        const [deleteTransResult] = await pool.execute(
          `DELETE FROM credit_transactions WHERE id IN (${placeholders})`,
          virtualIds
        );
        deletedTransactions = (deleteTransResult as any).affectedRows || 0;
      }

      // 3. 计算真实的积分（只有 ¥1.00 的充值）
      const [realTransactions] = await pool.execute(
        'SELECT SUM(amount) as total FROM credit_transactions WHERE user_id = ? AND type = "recharge"',
        [userId]
      );
      const realCredits = (realTransactions as any[])[0]?.total || 0;

      // 4. 更新用户积分
      await userDb.updateCredits(userId, realCredits);

      console.log(`✅ 清理虚拟数据完成: 删除${deletedOrders}个订单, 删除${deletedTransactions}条交易, 用户积分更新为${realCredits}`);

      res.json({
        success: true,
        message: '虚拟数据已清理',
        deleted: {
          orders: deletedOrders,
          transactions: deletedTransactions
        },
        realCredits: realCredits
      });
    } catch (error: any) {
      console.error('清理虚拟数据失败:', error);
      res.status(500).json({ success: false, message: '清理失败' });
    }
  });

  // 恢复充值数据（如果清理出错）
  app.post("/api/payment/restore", authMiddleware, async (req: any, res) => {
    try {
      // 只有主账号可以恢复数据
      if (req.user.isSubUser) {
        return res.status(403).json({ success: false, message: '子账号无权限' });
      }

      const userId = req.user.id;

      // 检查是否已有 ¥1.00 的充值
      const [existing] = await pool.execute(
        'SELECT id FROM credit_transactions WHERE user_id = ? AND type = "recharge" AND amount = 1.00',
        [userId]
      );

      if ((existing as any[]).length > 0) {
        return res.status(400).json({ success: false, message: '已存在 ¥1.00 的充值记录' });
      }

      // 恢复 ¥1.00 的充值
      await creditTransactionDb.create(userId, 1.00, 'recharge', '微信支付充值 - 订单号: order_restored');
      await userDb.updateCredits(userId, 1.00);

      console.log(`✅ 恢复充值数据完成: 用户${userId}的积分已恢复为¥1.00`);

      res.json({
        success: true,
        message: '充值数据已恢复',
        restoredCredits: 1.00
      });
    } catch (error: any) {
      console.error('恢复充值数据失败:', error);
      res.status(500).json({ success: false, message: '恢复失败' });
    }
  });

  // 反推提示词扣费
  app.post("/api/prompt-reverse/deduct-credits", authMiddleware, async (req: any, res) => {
    try {
      const { imageCount, creditsPerImage } = req.body;
      const userId = req.user.id;
      const parentUserId = req.user.parentUserId || req.user.id;
      
      if (!imageCount || !creditsPerImage) {
        return res.status(400).json({ success: false, message: '参数不完整' });
      }

      const totalCredits = imageCount * creditsPerImage;
      
      // 获取用户当前积分
      const user = await userDb.findById(userId);
      if (!user) {
        return res.status(404).json({ success: false, message: '用户不存在' });
      }

      const currentCredits = user.credits || 0;
      
      // 检查积分是否足够
      if (currentCredits < totalCredits) {
        return res.status(400).json({ 
          success: false, 
          message: `积分不足，需要 ¥${totalCredits.toFixed(1)}，当前仅有 ¥${currentCredits.toFixed(1)}` 
        });
      }

      // 扣费
      const newCredits = currentCredits - totalCredits;
      await userDb.updateCredits(userId, newCredits);

      // 记录交易
      await creditTransactionDb.create(userId, totalCredits, 'deduct', `反推提示词 - ${imageCount}张图片`);

      console.log('✅ 反推提示词扣费成功:', {
        userId,
        imageCount,
        totalCredits,
        previousCredits: currentCredits,
        newCredits
      });

      // 代理佣金
      await handleConsumptionCommission(parentUserId, totalCredits, 'consume', 'prompt_reverse');

      res.json({
        success: true,
        message: '扣费成功',
        deductedCredits: totalCredits,
        newCredits
      });
    } catch (error: any) {
      console.error('反推提示词扣费失败:', error);
      res.status(500).json({ success: false, message: '扣费失败' });
    }
  });

  // 退出登录
  app.post("/api/auth/logout", authMiddleware, async (req: any, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      await sessionDb.delete(token);
    }
    res.json({ success: true, message: '已退出登录' });
  });

  // 更新用户 API Key（管理员用）
  app.post("/api/auth/update-api-key", authMiddleware, async (req: any, res) => {
    try {
      const { email, apiKey } = req.body;
      
      if (!email || !apiKey) {
        return res.status(400).json({ error: '邮箱和 API Key 不能为空' });
      }
      
      await userDb.updateApiKey(email, apiKey);
      res.json({ success: true, message: `已更新 ${email} 的 API Key` });
    } catch (error: any) {
      console.error('更新 API Key 失败:', error);
      res.status(500).json({ error: error.message || '更新失败' });
    }
  });

  // ==================== 子账号 API ====================

  // 子账号登录
  app.post("/api/auth/sub-login", async (req, res) => {
    const { email, password } = req.body;
    
    const ipAddress = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || 
                      req.headers['x-real-ip']?.toString() || 
                      req.socket.remoteAddress || 
                      'unknown';
    
    if (!email || !password) {
      return res.status(400).json({ success: false, message: '请输入邮箱和密码' });
    }

    // 验证 AJ-Captcha
    const { captchaToken } = req.body;
    if (!captchaToken || !captchaVerifiedTokens.has(captchaToken)) {
      return res.status(400).json({ success: false, message: '请先完成安全验证' });
    }
    captchaVerifiedTokens.delete(captchaToken);

    try {
      const subUser = await subUserDb.findByEmail(email);
      if (!subUser) {
        return res.status(401).json({ success: false, message: '邮箱或密码错误' });
      }

      if (!subUser.is_enabled) {
        console.log('🔴 子账号被禁用:', { subUserId: subUser.id, parent_user_id: subUser.parent_user_id });
        const parentUser = await userDb.findById(subUser.parent_user_id);
        console.log('🔴 主账号信息:', parentUser);
        return res.status(403).json({
          success: false,
          message: '账号已被禁用，请联系主账号管理员',
          parentEmail: parentUser?.email || null
        });
      }

      const isValid = await verifyPassword(password, subUser.password_hash);
      if (!isValid) {
        return res.status(401).json({ success: false, message: '邮箱或密码错误' });
      }

      await subUserDb.updateLastLogin(subUser.id);

      // 获取主账号的积分
      const parentUser = await userDb.findById(subUser.parent_user_id);
      if (!parentUser) {
        console.error(`❌ 主账号不存在: ${subUser.parent_user_id}`);
        return res.status(500).json({ success: false, message: '主账号不存在' });
      }

      const token = generateToken();
      console.log(`🔐 子账号登录: ${email} (IP: ${ipAddress}), 主账号积分: ${parentUser.credits}`);
      
      // 创建会话，关联sub_user_id
      const connection = await pool.getConnection();
      try {
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await connection.execute(
          'INSERT INTO sessions (user_id, sub_user_id, token, expires_at, ip_address) VALUES (?, ?, ?, ?, ?)',
          [subUser.parent_user_id, subUser.id, token, expiresAt, ipAddress]
        );
      } finally {
        connection.release();
      }

      // 计算子账号显示积分：配额模式显示剩余额度，共享模式显示主账号积分
      let displayCredits = parentUser?.credits || 0;
      let quotaLimit = 0;
      let quotaConsumed = 0;
      if (parentUser?.sub_quota_mode === 'allocated') {
        quotaLimit = Number(subUser.quota_limit || 0);
        quotaConsumed = Number(subUser.quota_consumed || 0);
        displayCredits = Math.max(0, quotaLimit - quotaConsumed);
      }

      res.json({
        success: true,
        token,
        user: {
          id: subUser.id,
          email: subUser.email,
          name: subUser.name,
          parentUserId: subUser.parent_user_id,
          isSubUser: true,
          credits: displayCredits,
          apiKey: parentUser?.api_key || null,
          quota_mode: parentUser?.sub_quota_mode || 'shared',
          quota_limit: quotaLimit,
          quota_consumed: quotaConsumed
        },
        apiKey: parentUser?.api_key || null,
        message: '登录成功'
      });
    } catch (error: any) {
      console.error('Sub-user login error:', error);
      res.status(500).json({ success: false, message: '登录失败，请稍后重试' });
    }
  });

  // 生成邀请码
  // 子账号注册（由主账号直接创建，不需要邀请码）

  // 获取子账号列表（含配额信息）
  app.get("/api/auth/sub-users", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const isMainAccount = !req.user.isSubUser;

      // 获取主账号的配额模式
      let quotaMode = 'shared';
      let mainCredits = 0;
      if (isMainAccount) {
        const [userRows] = await pool.execute(
          'SELECT credits, sub_quota_mode FROM users WHERE id = ?',
          [userId]
        );
        mainCredits = parseFloat((userRows as any[])[0]?.credits) || 0;
        quotaMode = (userRows as any[])[0]?.sub_quota_mode || 'shared';
      }

      const subUsersResult = await subUserDb.getByParentUserId(req.user.id);
      const subUsers = Array.isArray(subUsersResult) ? subUsersResult : [];

      // 获取每个子账号的积分消耗（从交易记录统计的冗余数据，现在用 quota_consumed）
      const subUsersWithQuota = subUsers.map((subUser: any) => {
        const quotaLimit = Number(subUser.quota_limit || 0);
        const quotaConsumed = Number(subUser.quota_consumed || 0);
        return {
          id: subUser.id,
          email: subUser.email,
          name: subUser.name,
          is_enabled: subUser.is_enabled,
          created_at: subUser.created_at,
          quota_limit: quotaLimit,
          quota_consumed: quotaConsumed,
          quota_remaining: Math.max(0, quotaLimit - quotaConsumed),
          credits_spent: quotaConsumed // 使用 quota_consumed 作为已消耗
        };
      });

      res.json({
        success: true,
        data: subUsersWithQuota,
        quota_mode: quotaMode,
        credits: mainCredits
      });
    } catch (error: any) {
      console.error('Get sub-users error:', error);
      res.status(500).json({ success: false, message: '获取子账号列表失败' });
    }
  });

  // 创建子账号（主账号直接创建）
  app.post("/api/auth/sub-users", authMiddleware, async (req: any, res) => {
    try {
      // 只有主账号可以创建子账号
      if (req.user.isSubUser) {
        return res.status(403).json({ success: false, message: '子账号无权限创建子账号' });
      }

      const { email, password, name } = req.body;

      if (!email || !password || !name) {
        return res.status(400).json({ success: false, message: '请填写所有必填项' });
      }

      if (password.length < 6) {
        return res.status(400).json({ success: false, message: '密码至少需要 6 位' });
      }

      // 检查邮箱是否已存在
      const existingSubUser = await subUserDb.findByEmail(email);
      if (existingSubUser) {
        return res.status(400).json({ success: false, message: '该邮箱已被注册' });
      }

      // 创建子账号
      const passwordHash = await hashPassword(password);
      await subUserDb.create(req.user.id, email, passwordHash, name);

      res.json({ success: true, message: '子账号创建成功' });
    } catch (error: any) {
      console.error('Create sub-user error:', error);
      res.status(500).json({ success: false, message: '创建子账号失败' });
    }
  });

  // 禁用/启用子账号
  app.post("/api/auth/sub-users/:id/toggle", authMiddleware, async (req: any, res) => {
    try {
      const subUserId = parseInt(req.params.id);
      const { isEnabled } = req.body;

      const subUser = await subUserDb.findById(subUserId);
      if (!subUser || subUser.parent_user_id !== req.user.id) {
        return res.status(403).json({ success: false, message: '无权限操作' });
      }

      await subUserDb.toggleEnabled(subUserId, isEnabled);
      res.json({ success: true, message: isEnabled ? '已启用' : '已禁用' });
    } catch (error: any) {
      console.error('Toggle sub-user error:', error);
      res.status(500).json({ success: false, message: '操作失败' });
    }
  });

  // 删除子账号
  app.delete("/api/auth/sub-users/:id", authMiddleware, async (req: any, res) => {
    try {
      const subUserId = parseInt(req.params.id);

      const subUser = await subUserDb.findById(subUserId);
      if (!subUser || subUser.parent_user_id !== req.user.id) {
        return res.status(403).json({ success: false, message: '无权限操作' });
      }

      await subUserDb.delete(subUserId);
      res.json({ success: true, message: '已删除' });
    } catch (error: any) {
      console.error('Delete sub-user error:', error);
      res.status(500).json({ success: false, message: '删除失败' });
    }
  });

  // 切换子账号配额模式（shared/allocated）
  app.put("/api/auth/sub-users/quota-mode", authMiddleware, async (req: any, res) => {
    try {
      if (req.user.isSubUser) {
        return res.status(403).json({ success: false, message: '无权限操作' });
      }

      const { mode } = req.body;
      if (!mode || !['shared', 'allocated'].includes(mode)) {
        return res.status(400).json({ success: false, message: '模式必须是 shared 或 allocated' });
      }

      const userId = req.user.id;

      // 切换到配额模式时，校验已分配配额是否超过余额
      if (mode === 'allocated') {
        const [userRows] = await pool.execute(
          'SELECT credits FROM users WHERE id = ?',
          [userId]
        );
        const credits = (userRows as any[])[0]?.credits || 0;
        const totalAllocated = await subUserDb.getTotalAllocatedQuota(userId);

        if (totalAllocated > credits) {
          return res.status(400).json({
            success: false,
            message: `已分配配额 (${totalAllocated.toFixed(1)}) 超过当前积分余额 (${credits.toFixed(1)})，请先减少配额`
          });
        }
      }

      await pool.execute(
        'UPDATE users SET sub_quota_mode = ? WHERE id = ?',
        [mode, userId]
      );

      const [updated] = await pool.execute(
        'SELECT credits, sub_quota_mode FROM users WHERE id = ?',
        [userId]
      );
      const userData = (updated as any[])[0];

      res.json({
        success: true,
        message: mode === 'allocated' ? '已切换到配额模式' : '已切换到共享模式',
        mode: userData.sub_quota_mode,
        credits: userData.credits
      });
    } catch (error: any) {
      console.error('切换配额模式失败:', error);
      res.status(500).json({ success: false, message: '切换失败' });
    }
  });

  // 设置子账号配额
  app.put("/api/auth/sub-users/:id/quota", authMiddleware, async (req: any, res) => {
    try {
      if (req.user.isSubUser) {
        return res.status(403).json({ success: false, message: '无权限操作' });
      }

      const subUserId = parseInt(req.params.id);
      const { quotaLimit } = req.body;

      if (quotaLimit === undefined || quotaLimit < 0) {
        return res.status(400).json({ success: false, message: '配额必须 >= 0' });
      }

      // 验证子账号属于当前用户
      const subUser = await subUserDb.findById(subUserId);
      if (!subUser || subUser.parent_user_id !== req.user.id) {
        return res.status(403).json({ success: false, message: '无权限操作' });
      }

      const userId = req.user.id;
      const quotaNum = Number(quotaLimit);

      // 获取主账号积分和其他子账号的配额总和
      const [userRows] = await pool.execute(
        'SELECT credits FROM users WHERE id = ?',
        [userId]
      );
      const credits = (userRows as any[])[0]?.credits || 0;
      const otherAllocated = await subUserDb.getTotalAllocatedQuota(userId) - Number(subUser.quota_limit || 0);

      // 校验：新配额 + 其他子账号配额 <= 主账号积分
      if (quotaNum + otherAllocated > credits) {
        return res.status(400).json({
          success: false,
          message: `配额设置失败：该配额 (${quotaNum.toFixed(1)}) + 其他子账号已分配 (${otherAllocated.toFixed(1)}) = ${(quotaNum + otherAllocated).toFixed(1)}，超过当前积分余额 (${credits.toFixed(1)})`
        });
      }

      await subUserDb.updateQuota(subUserId, quotaNum);

      res.json({
        success: true,
        message: `配额已设置为 ${quotaNum.toFixed(1)} 积分`,
        quotaLimit: quotaNum,
        quotaConsumed: 0
      });
    } catch (error: any) {
      console.error('设置配额失败:', error);
      res.status(500).json({ success: false, message: '设置配额失败' });
    }
  });

  // 追加子账号配额
  app.post("/api/auth/sub-users/:id/quota/add", authMiddleware, async (req: any, res) => {
    try {
      if (req.user.isSubUser) {
        return res.status(403).json({ success: false, message: '无权限操作' });
      }

      const subUserId = parseInt(req.params.id);
      const { amount } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({ success: false, message: '追加数量必须大于 0' });
      }

      // 验证子账号属于当前用户
      const subUser = await subUserDb.findById(subUserId);
      if (!subUser || subUser.parent_user_id !== req.user.id) {
        return res.status(403).json({ success: false, message: '无权限操作' });
      }

      const userId = req.user.id;
      const addAmount = Number(amount);

      // 获取主账号积分和其他子账号的配额总和
      const [userRows] = await pool.execute(
        'SELECT credits FROM users WHERE id = ?',
        [userId]
      );
      const credits = (userRows as any[])[0]?.credits || 0;
      const currentQuota = Number(subUser.quota_limit || 0);
      const otherAllocated = await subUserDb.getTotalAllocatedQuota(userId) - currentQuota;

      // 校验：追加后配额 + 其他子账号配额 <= 主账号积分
      const newQuota = currentQuota + addAmount;
      if (newQuota + otherAllocated > credits) {
        return res.status(400).json({
          success: false,
          message: `追加失败：追加后总额度 (${newQuota.toFixed(1)}) + 其他子账号已分配 (${otherAllocated.toFixed(1)}) = ${(newQuota + otherAllocated).toFixed(1)}，超过当前积分余额 (${credits.toFixed(1)})`
        });
      }

      await pool.execute(
        'UPDATE sub_users SET quota_limit = quota_limit + ? WHERE id = ?',
        [addAmount, subUserId]
      );

      const [updated] = await pool.execute(
        'SELECT quota_limit, quota_consumed FROM sub_users WHERE id = ?',
        [subUserId]
      );
      const updatedSub = (updated as any[])[0];

      res.json({
        success: true,
        message: `已追加 ${addAmount.toFixed(1)} 积分`,
        quotaLimit: Number(updatedSub.quota_limit),
        quotaConsumed: Number(updatedSub.quota_consumed)
      });
    } catch (error: any) {
      console.error('追加配额失败:', error);
      res.status(500).json({ success: false, message: '追加配额失败' });
    }
  });

  // 获取主账号的总消费（包括所有子账号）
  app.get("/api/auth/total-consumption", authMiddleware, async (req: any, res) => {
    try {
      // 只有主账号可以查看
      if (req.user.isSubUser) {
        return res.status(403).json({ success: false, message: '子账号无权限查看' });
      }

      const userId = req.user.id;
      
      // 获取主账号的消费记录
      const [mainConsumption] = await pool.execute(
        'SELECT SUM(ABS(amount)) as total FROM credit_transactions WHERE user_id = ? AND amount < 0',
        [userId]
      );
      
      // 获取所有子账号的消费记录
      const [subConsumption] = await pool.execute(
        'SELECT SUM(ABS(amount)) as total FROM credit_transactions WHERE parent_user_id = ? AND amount < 0',
        [userId]
      );
      
      const mainTotal = (mainConsumption as any[])[0]?.total || 0;
      const subTotal = (subConsumption as any[])[0]?.total || 0;
      
      res.json({
        success: true,
        consumption: {
          main: mainTotal,
          sub: subTotal,
          total: mainTotal + subTotal
        }
      });
    } catch (error: any) {
      console.error('Get total consumption error:', error);
      res.status(500).json({ success: false, message: '获取消费统计失败' });
    }
  });

  // 扣费端点
  app.post("/api/credits/deduct", authMiddleware, async (req: any, res: any) => {
    try {
      const { amount, type, description } = req.body;
      const userId = req.user.id;
      const parentUserId = req.user.parentUserId || req.user.id;
      const subUserId = req.user.isSubUser ? userId : undefined;

      if (!amount || amount <= 0) {
        return res.status(400).json({ success: false, message: '扣费金额必须大于0' });
      }

      const result = await creditTransactionDb.deduct(parentUserId, amount, type || 'generate', description || '图片生成', parentUserId, subUserId);

      if (!result.success) {
        return res.status(400).json({ success: false, message: result.message || '扣费失败' });
      }

      // 代理佣金：检查消费用户是否有上级代理
      await handleConsumptionCommission(parentUserId, amount, 'consume', type || 'generate');

      const updatedUser = await userDb.findById(parentUserId);
      res.json({ success: true, remainingCredits: updatedUser?.credits || 0 });
    } catch (error: any) {
      console.error('扣费失败:', error.message);
      res.status(500).json({ success: false, message: '扣费失败: ' + error.message });
    }
  });

  // ==================== 代理系统 API ====================

  // 生成邀请码
  app.post("/api/agent/invite-code", authMiddleware, async (req: any, res) => {
    try {
      if (req.user.isSubUser) {
        return res.status(403).json({ success: false, message: '子账号无权限' });
      }
      const userId = req.user.id;
      const user = await userDb.findById(userId);
      if (!user) return res.status(404).json({ success: false, message: '用户不存在' });
      if (!user.is_agent) {
        return res.status(403).json({ success: false, message: '您不是代理，无法生成邀请码。请联系管理员开通代理资格' });
      }
      const code = await inviteCodeDb.create(userId);
      res.json({ success: true, code });
    } catch (error: any) {
      console.error('生成邀请码失败:', error);
      res.status(500).json({ success: false, message: '生成邀请码失败' });
    }
  });

  // 查看邀请码列表
  app.get("/api/agent/invite-codes", authMiddleware, async (req: any, res) => {
    try {
      if (req.user.isSubUser) {
        return res.status(403).json({ success: false, message: '子账号无权限' });
      }
      const codes = await inviteCodeDb.getByParentUserId(req.user.id);
      res.json({ success: true, data: codes });
    } catch (error: any) {
      res.status(500).json({ success: false, message: '获取邀请码失败' });
    }
  });

  // 查看佣金概览和流水
  app.get("/api/agent/commission", authMiddleware, async (req: any, res) => {
    try {
      if (req.user.isSubUser) {
        return res.status(403).json({ success: false, message: '子账号无权限' });
      }
      const userId = req.user.id;
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;
      const user = await userDb.findById(userId);
      const commissionData = await commissionDb.getByAgentId(userId, page, pageSize);
      res.json({
        success: true,
        balance: parseFloat(user?.commission_balance || '0'),
        ...commissionData
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: '获取佣金数据失败' });
    }
  });

  // 查看我邀请的客户
  app.get("/api/agent/customers", authMiddleware, async (req: any, res) => {
    try {
      if (req.user.isSubUser) {
        return res.status(403).json({ success: false, message: '子账号无权限' });
      }
      const page = parseInt(req.query.page as string) || 1;
      const result = await userDb.findAgentCustomers(req.user.id, page);
      res.json({ success: true, ...result });
    } catch (error: any) {
      res.status(500).json({ success: false, message: '获取客户列表失败' });
    }
  });

  // 获取代理自定义定价
  app.get("/api/agent/pricing", authMiddleware, async (req: any, res) => {
    try {
      if (req.user.isSubUser) {
        return res.status(403).json({ success: false, message: '子账号无权限' });
      }
      const agentId = req.query.agentId ? parseInt(req.query.agentId as string) : req.user.id;
      // 管理员可以查看任意代理的定价，普通代理只能看自己的
      if (agentId !== req.user.id && !req.user.isAdmin) {
        return res.status(403).json({ success: false, message: '无权限' });
      }
      const pricing = await agentDb.getPricing(agentId);
      // 同时返回定价配置的名称
      const [configRows]: any = await pool.execute(
        'SELECT `key`, name, price FROM pricing_config WHERE enabled = 1'
      );
      res.json({ success: true, data: pricing, config: configRows });
    } catch (error: any) {
      res.status(500).json({ success: false, message: '获取定价失败' });
    }
  });

  // 设置代理自定义定价
  app.put("/api/agent/pricing", authMiddleware, async (req: any, res) => {
    try {
      if (req.user.isSubUser) {
        return res.status(403).json({ success: false, message: '子账号无权限' });
      }
      const { pricing } = req.body;
      if (!pricing || typeof pricing !== 'object') {
        return res.status(400).json({ success: false, message: '请提供有效的定价数据' });
      }
      // 确保是代理
      const user = await userDb.findById(req.user.id);
      if (!user?.is_agent) {
        return res.status(403).json({ success: false, message: '您不是代理，无权限设置定价' });
      }
      // 验证定价不能低于官方价格
      const [pricingRows]: any = await pool.execute('SELECT `key`, price FROM pricing_config WHERE enabled = 1');
      const defaultPrices: Record<string, number> = {};
      for (const row of pricingRows) { defaultPrices[row.key] = parseFloat(row.price); }
      const errors: string[] = [];
      for (const [key, price] of Object.entries(pricing)) {
        const defaultPrice = defaultPrices[key];
        if (defaultPrice !== undefined && (price as number) < defaultPrice) {
          errors.push(`${key}: 代理价 ${price} 低于官方价 ${defaultPrice}`);
        }
      }
      if (errors.length > 0) {
        return res.status(400).json({ success: false, message: `定价不能低于官方价格: ${errors.join('; ')}` });
      }
      await agentDb.setPricing(req.user.id, pricing);
      res.json({ success: true, message: '定价保存成功' });
    } catch (error: any) {
      console.error('设置定价失败:', error);
      res.status(500).json({ success: false, message: '设置定价失败' });
    }
  });

  // 提交提现申请
  // 申请成为代理
  app.post("/api/agent/apply", authMiddleware, async (req: any, res) => {
    try {
      if (req.user.isSubUser) {
        return res.status(403).json({ success: false, message: '子账号无权限' });
      }
      const userId = req.user.id;
      const user = await userDb.findById(userId);
      if (!user) return res.status(404).json({ success: false, message: '用户不存在' });
      if (user.is_agent) {
        return res.status(400).json({ success: false, message: '您已经是代理' });
      }
      if (user.applied_agent) {
        return res.status(400).json({ success: false, message: '您已提交过申请，请耐心等待管理员审核' });
      }
      await pool.execute('UPDATE users SET applied_agent = 1 WHERE id = ?', [userId]);
      // 发送邮件通知管理员
      const adminEmail = process.env.ADMIN_EMAIL;
      if (adminEmail) {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || 'smtp.163.com',
          port: 465, secure: true,
          auth: { user: process.env.SMTP_USER || 'softhooky@163.com', pass: process.env.SMTP_PASS || '' }
        });
        await transporter.sendMail({
          from: process.env.SMTP_FROM || '"SoftHooky" <softhooky@163.com>',
          to: adminEmail,
          subject: `【SoftHooky】代理申请通知 - ${user.email}`,
          html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 500px; margin: 0 auto;">
              <h2 style="color: #6366F1;">🙋 代理申请</h2>
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px 0; color: #666;">用户邮箱</td><td style="font-weight: bold;">${user.email}</td></tr>
                <tr><td style="padding: 8px 0; color: #666;">用户ID</td><td style="font-weight: bold;">${userId}</td></tr>
                <tr><td style="padding: 8px 0; color: #666;">申请时间</td><td style="font-weight: bold;">${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</td></tr>
              </table>
              <p style="margin-top: 20px;">请前往管理后台审核：<a href="${process.env.ADMIN_URL || 'https://softhooky.com/admin/users'}" style="color: #6366F1;">用户管理 → 设为代理</a></p>
            </div>
          `
        });
        console.log('📧 代理申请通知邮件已发送');
      }
      res.json({ success: true, message: '申请已提交，请等待管理员审核' });
    } catch (error: any) {
      console.error('申请代理失败:', error);
      res.status(500).json({ success: false, message: '申请失败，请稍后重试' });
    }
  });

  app.post("/api/agent/withdraw", authMiddleware, async (req: any, res) => {
    try {
      if (req.user.isSubUser) {
        return res.status(403).json({ success: false, message: '子账号无权限' });
      }
      const { amount, accountType, accountId } = req.body;
      if (!amount || amount <= 0) {
        return res.status(400).json({ success: false, message: '请输入有效的提现金额' });
      }
      if (!accountType || !['wechat', 'alipay'].includes(accountType)) {
        return res.status(400).json({ success: false, message: '请选择收款方式（微信/支付宝）' });
      }
      if (!accountId) {
        return res.status(400).json({ success: false, message: '请输入收款账号' });
      }
      const userId = req.user.id;
      const user = await userDb.findById(userId);
      if (!user || user.commission_balance < amount) {
        return res.status(400).json({ success: false, message: `佣金余额不足，可用余额: ${user?.commission_balance || 0}` });
      }
      // 扣除佣金余额
      await pool.execute('UPDATE users SET commission_balance = commission_balance - ? WHERE id = ?', [amount, userId]);
      // 创建提现申请
      await withdrawDb.create(userId, amount, accountType, accountId);
      // 异步发送邮件通知管理员
      sendWithdrawNotificationEmail(user.email, amount, accountType, accountId).catch(err => {
        console.error('发送提现通知邮件失败:', err);
      });
      res.json({ success: true, message: '提现申请已提交，站长将在24小时内处理，请留意您的收款账号' });
    } catch (error: any) {
      console.error('提现失败:', error);
      res.status(500).json({ success: false, message: '提现失败' });
    }
  });

  // 查看提现记录
  app.get("/api/agent/withdraw-logs", authMiddleware, async (req: any, res) => {
    try {
      if (req.user.isSubUser) {
        return res.status(403).json({ success: false, message: '子账号无权限' });
      }
      const logs = await withdrawDb.getByAgentId(req.user.id);
      res.json({ success: true, data: logs });
    } catch (error: any) {
      res.status(500).json({ success: false, message: '获取提现记录失败' });
    }
  });

  // ==================== Banner轮播图历史 API ====================

  // 保存Banner轮播图记录
  app.post("/api/banner-carousel", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const parentUserId = req.user.parentUserId || req.user.id;
      const { productImages, productDescription, analysisResult, generatedImages, bannerCount } = req.body;

      if (!productImages || !generatedImages) {
        return res.status(400).json({ success: false, message: '产品图片和生成图片不能为空' });
      }

      const recordId = await bannerCarouselDb.create(userId, {
        productImages,
        productDescription,
        analysisResult,
        generatedImages,
        bannerCount: bannerCount || generatedImages.length,
        parentUserId
      });

      res.json({ success: true, recordId, message: 'Banner轮播图记录已保存' });
    } catch (error: any) {
      console.error('保存Banner轮播图记录失败:', error);
      res.status(500).json({ success: false, message: '保存记录失败' });
    }
  });

  // 获取Banner轮播图历史记录列表
  app.get("/api/banner-carousel", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const page = parseInt(req.query.page) || 1;
      const pageSize = parseInt(req.query.pageSize) || 10;

      const result = await bannerCarouselDb.getByUserId(userId, page, pageSize);

      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error('获取Banner轮播图历史记录失败:', error);
      res.status(500).json({ success: false, message: '获取历史记录失败' });
    }
  });

  // 获取单条Banner轮播图记录详情
  app.get("/api/banner-carousel/:id", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const recordId = parseInt(req.params.id);

      const record = await bannerCarouselDb.getById(recordId, userId);

      if (!record) {
        return res.status(404).json({ success: false, message: '记录不存在' });
      }

      res.json({ success: true, record });
    } catch (error: any) {
      console.error('获取Banner轮播图记录详情失败:', error);
      res.status(500).json({ success: false, message: '获取记录详情失败' });
    }
  });

  // 删除Banner轮播图记录
  app.delete("/api/banner-carousel/:id", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const recordId = parseInt(req.params.id);

      await bannerCarouselDb.delete(recordId, userId);

      res.json({ success: true, message: '记录已删除' });
    } catch (error: any) {
      console.error('删除Banner轮播图记录失败:', error);
      res.status(500).json({ success: false, message: '删除记录失败' });
    }
  });

  // ==================== 图片库 API ====================

  // 保存图片到数据库
  app.post("/api/images/library", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const parentUserId = req.user.parentUserId || req.user.id;
      const subUserId = req.user.isSubUser ? userId : undefined;
      const { imageUrl, prompt, model, type, aspectRatio, isVideo } = req.body;

      console.log('📥 保存图片请求完整数据:', { 
        userId, 
        imageUrl: imageUrl?.substring(0, 100), 
        prompt: prompt?.substring(0, 100), 
        model,
        type,
        aspectRatio,
        isVideo,
        bodyKeys: Object.keys(req.body),
        allBody: req.body,
        authUser: req.user
      });

      if (!imageUrl) {
        return res.status(400).json({ success: false, message: '图片URL不能为空' });
      }

      let finalUrl = imageUrl;

      // 如果是视频，下载并上传到 COS
      if (isVideo || imageUrl.includes('.mp4') || imageUrl.includes('video')) {
        console.log('📹 检测到视频 URL，正在下载并上传到 COS...');
        try {
          const videoResponse = await axios.get(imageUrl, { 
            responseType: 'arraybuffer', 
            timeout: 300000
          });
          const videoBuffer = Buffer.from(videoResponse.data);
          
          const now = new Date();
          const year = now.getFullYear().toString();
          const month = (now.getMonth() + 1).toString().padStart(2, '0');
          const timestamp = Date.now();
          const randomStr = Math.random().toString(36).substring(2, 8);
          
          let userPath = '';
          if (subUserId) {
            userPath = `${parentUserId}/${subUserId}/${year}/${month}/`;
          } else {
            userPath = `${parentUserId}/${year}/${month}/`;
          }
          const fileName = `${userPath}video-${timestamp}-${randomStr}.mp4`;
          
          const command = new PutObjectCommand({
            Bucket: process.env.COS_BUCKET!,
            Key: fileName,
            Body: videoBuffer,
            ContentType: 'video/mp4',
          });
          
          await cosClient.send(command);
          finalUrl = `${process.env.COS_PUBLIC_URL}/${fileName}`;
          console.log('✅ 视频已上传到 COS:', finalUrl);
        } catch (uploadError: any) {
          console.error('❌ 视频上传失败，使用原 URL:', uploadError.message);
          finalUrl = imageUrl;
        }
      }

      console.log('🔍 调用generatedImagesDb.create...');
      const imageId = await generatedImagesDb.create(
        userId,
        finalUrl,
        prompt || '',
        {
          model: model || 'gemini-3.1-flash-image-preview',
          type: type || 'generated',
          aspectRatio: aspectRatio || '1:1',
          parentUserId: subUserId ? parentUserId : undefined
        }
      );

      console.log('✅ 图片已保存到数据库，ID:', imageId);
      
      // 扣费逻辑：视频扣0.5，图片扣0.3（只有明确要求扣费时才扣，避免重复扣费）
      const { skipDeduct } = req.body;
      if (skipDeduct) {
        console.log('⏭️ 跳过扣费（图片生成时已扣费）');
      } else {
        try {
          const deductAmount = isVideo ? 1.5 : 0.3;
          const deductType = isVideo ? 'video' : 'generate';
          const deductDesc = isVideo ? '视频生成' : (prompt ? prompt.substring(0, 30) : '图片生成');
          
          console.log('💰 开始扣费:', { deductAmount, deductType, deductDesc, parentUserId });
          
          const deductResult = await creditTransactionDb.deduct(
            parentUserId,
            deductAmount,
            deductType,
            deductDesc,
            parentUserId,
            subUserId
          );
          
          if (deductResult.success) {
            console.log('✅ 扣费成功');
            // 代理佣金
            const savePricingKey = isVideo ? 'gemini_video_4s' : 'nanobann2_generation';
            await handleConsumptionCommission(parentUserId, deductAmount, 'consume', savePricingKey);
          } else {
            console.error('⚠️ 扣费失败:', deductResult.message);
          }
        } catch (deductError: any) {
          console.error('❌ 扣费过程出错:', deductError.message);
          // 扣费失败不影响保存结果，继续返回成功
        }
      }
      
      res.json({ success: true, message: '图片已保存到数据库', imageId });
    } catch (error: any) {
      console.error('❌ 保存图片失败 - 错误信息:', error.message);
      console.error('❌ 错误堆栈:', error.stack);
      console.error('❌ 完整错误:', error);
      res.status(500).json({ success: false, message: '保存图片失败: ' + error.message });
    }
  });

  // 获取用户的图片列表（分页）
  app.get("/api/images/library", authMiddleware, async (req: any, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;
      const filter = (req.query.filter as string) || 'mine';

      const userId = req.user.id;
      const parentUserId = req.user.parentUserId || req.user.id;

      const result = await generatedImagesDb.getByUserId(userId, parentUserId, page, pageSize, filter);

      res.json({
        success: true,
        data: result.images,
        pagination: {
          page: result.page,
          pageSize: result.pageSize,
          total: result.total,
          totalPages: result.totalPages
        }
      });
    } catch (error: any) {
      console.error('获取图片库失败:', error);
      res.status(500).json({ success: false, message: '获取图片库失败' });
    }
  });

  // 删除图片记录
  app.delete("/api/images/library/:id", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const parentUserId = req.user.parentUserId || req.user.id;
      const imageId = parseInt(req.params.id);

      // 主账号可删除自己和子账号的图片，子账号只能删自己的
      const userCondition = req.user.isSubUser
        ? 'user_id = ?'
        : '(user_id = ? OR parent_user_id = ?)';
      const queryParams = req.user.isSubUser ? [imageId, userId] : [imageId, userId, parentUserId];

      const [rows] = await pool.execute(
        `SELECT image_url FROM generated_images WHERE id = ? AND ${userCondition}`,
        queryParams
      );
      const imageUrl = (rows as any[])[0]?.image_url;

      if (!imageUrl) {
        return res.status(404).json({ success: false, message: '图片不存在或无权删除' });
      }

      // 从COS删除图片（只处理COS URL）
      if (imageUrl.includes(process.env.COS_PUBLIC_URL || '')) {
        try {
          const key = imageUrl.replace(process.env.COS_PUBLIC_URL + '/', '');
          await cosClient.send(new DeleteObjectCommand({
            Bucket: process.env.COS_BUCKET!,
            Key: key
          }));
          console.log('✅ COS图片已删除:', key);
        } catch (cosError: any) {
          console.error('删除COS图片失败:', cosError.message);
        }
      } else {
        console.log(`⏭️ 跳过非COS图片: ${imageUrl}`);
      }

      await pool.execute(
        `DELETE FROM generated_images WHERE id = ? AND ${userCondition}`,
        queryParams
      );

      res.json({ success: true, message: '图片已删除' });
    } catch (error: any) {
      console.error('删除图片失败:', error);
      res.status(500).json({ success: false, message: '删除图片失败' });
    }
  });

  // 通过URL删除图片（前端画布删除用）
  app.post("/api/images/delete-by-url", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const parentUserId = req.user.parentUserId || req.user.id;
      const { url } = req.body;

      if (!url) {
        return res.status(400).json({ success: false, message: '请提供图片URL' });
      }

      console.log('🗑️ 通过URL删除图片:', url.substring(0, 100));

      // 查找数据库记录
      const [rows] = await pool.execute(
        'SELECT id, image_url FROM generated_images WHERE image_url = ? AND (user_id = ? OR parent_user_id = ?) LIMIT 1',
        [url, userId, parentUserId]
      );
      const image = (rows as any[])[0];

      if (image) {
        // 从COS删除图片
        if (image.image_url && image.image_url.includes(process.env.COS_PUBLIC_URL || '')) {
          try {
            const key = image.image_url.replace(process.env.COS_PUBLIC_URL + '/', '');
            await cosClient.send(new DeleteObjectCommand({
              Bucket: process.env.COS_BUCKET!,
              Key: key
            }));
            console.log('✅ COS图片已删除:', key);
          } catch (cosError: any) {
            console.error('删除COS图片失败:', cosError.message);
          }
        }

        await generatedImagesDb.delete(image.id, userId);
        console.log('✅ 数据库记录已删除, id:', image.id);
      } else {
        console.log('⚠️ 数据库未找到该图片记录，仅清理画布');
      }

      res.json({ success: true, message: '图片已删除' });
    } catch (error: any) {
      console.error('通过URL删除图片失败:', error);
      res.status(500).json({ success: false, message: '删除图片失败' });
    }
  });

  // 批量删除图片记录
  app.post("/api/images/library/batch-delete", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const parentUserId = req.user.parentUserId || req.user.id;
      const { ids } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ success: false, message: '请提供要删除的图片ID列表' });
      }

      // 主账号可删自己和子账号的图，子账号只能删自己的
      const userCondition = req.user.isSubUser
        ? 'user_id = ?'
        : '(user_id = ? OR parent_user_id = ?)';
      const queryParams = req.user.isSubUser
        ? [...ids, userId]
        : [...ids, userId, parentUserId];

      // 获取所有图片URL
      const placeholders = ids.map(() => '?').join(',');
      const [rows] = await pool.execute(
        `SELECT id, image_url FROM generated_images WHERE id IN (${placeholders}) AND ${userCondition}`,
        queryParams
      );

      const images = rows as any[];

      // 从COS批量删除图片

      let deletedCount = 0;
      for (const image of images) {
        // 只处理 COS URL，跳过本地路径
        if (!image.image_url.includes(process.env.COS_PUBLIC_URL || '')) {
          console.log(`⏭️ 跳过非COS图片: ${image.image_url}`);
          continue;
        }
        try {
          const key = image.image_url.replace(process.env.COS_PUBLIC_URL + '/', '');
          await cosClient.send(new DeleteObjectCommand({
            Bucket: process.env.COS_BUCKET!,
            Key: key
          }));
          deletedCount++;
        } catch (cosError: any) {
          console.error('删除COS图片失败:', image.image_url, cosError.message);
        }
      }

      // 从数据库批量删除
      await pool.execute(
        `DELETE FROM generated_images WHERE id IN (${placeholders}) AND ${userCondition}`,
        queryParams
      );
      
      console.log(`✅ 批量删除完成: ${images.length}条记录, ${deletedCount}个COS文件`);
      
      res.json({ 
        success: true, 
        message: `已删除 ${images.length} 张图片`,
        deletedCount: images.length,
        cosDeletedCount: deletedCount
      });
    } catch (error: any) {
      console.error('批量删除图片失败:', error);
      res.status(500).json({ success: false, message: '批量删除失败' });
    }
  });

  // 更新图片在画布上的位置
  app.post("/api/images/update-positions", authMiddleware, async (req: any, res: any) => {
    const { images: positions } = req.body;
    const userId = req.user.id;

    if (!positions || !Array.isArray(positions) || positions.length === 0) {
      return res.status(400).json({ error: "请提供图片位置数据" });
    }

    try {
      await generatedImagesDb.batchUpdatePositions(positions, userId);
      res.json({ success: true, message: `已更新 ${positions.length} 张图片位置` });
    } catch (error: any) {
      console.error("更新图片位置失败:", error);
      res.status(500).json({ error: "更新图片位置失败" });
    }
  });

  // 清理用户自己的过期图片
  app.post('/api/images/library/cleanup', authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: '用户未认证' });
      }

      const [expired] = await pool.execute(
        `SELECT id, image_url FROM generated_images WHERE user_id = ? AND created_at < DATE_SUB(NOW(), INTERVAL 3 DAY)`,
        [userId]
      );
      const expiredImages = expired as any[];

      let cosDeleted = 0;
      for (const img of expiredImages) {
        const url = img.image_url;
        if (url && (url.includes(process.env.COS_PUBLIC_URL || '') || url.includes(''))) {
          try {
            const key = url.replace(process.env.COS_PUBLIC_URL + '/', '');
            await cosClient.send(new DeleteObjectCommand({
              Bucket: process.env.COS_BUCKET!,
              Key: key.startsWith('/') ? key.substring(1) : key,
            }));
            cosDeleted++;
          } catch (e: any) {
            console.error('删除COS图片失败:', e.message);
          }
        }
      }

      const [result] = await pool.execute(
        `DELETE FROM generated_images WHERE user_id = ? AND created_at < DATE_SUB(NOW(), INTERVAL 3 DAY)`,
        [userId]
      );

      const deletedCount = (result as any).affectedRows;

      res.json({
        success: true,
        message: `已清理 ${deletedCount} 张过期图片，已删除 ${cosDeleted} 个 COS 文件`,
        deletedCount,
        cosDeletedCount: cosDeleted,
      });
    } catch (error: any) {
      console.error('清理过期图片失败:', error);
      res.status(500).json({ success: false, message: '清理失败' });
    }
  });

  // 手动触发清理过期图片（管理员功能）
  app.post("/api/images/cleanup-expired", authMiddleware, async (req: any, res) => {
    try {
      const { cleanupExpiredImages } = await import('./src/server/cleanup-expired-images');
      const result = await cleanupExpiredImages();
      res.json(result);
    } catch (error: any) {
      console.error('清理过期图片失败:', error);
      res.status(500).json({ success: false, message: '清理失败' });
    }
  });

  // ==================== 图片生成 API ====================
  // API Route for Image Generation (Proxy to third-party API)
  app.post("/api/images/generations", authMiddleware, async (req: any, res: any) => {
    const { prompt, model, aspectRatio, resolution, n } = req.body;
    const generateCount = Math.min(Math.max(parseInt(n) || 1, 1), 4); // 1-4张
    const userId = req.user.id;
    const parentUserId = req.user.parentUserId || req.user.id;
    const subUserId = req.user.isSubUser ? userId : undefined;

    // 根据模型选择不同的 API 密钥和扣费
    const isGptImage2 = model === 'gpt-image-2';
    const isSeedream = model === 'seedream';
    const apiModel = isGptImage2
      ? 'gpt-image-2'
      : isSeedream
        ? 'seedream-5.0'
        : (model === 'nanobann2' ? 'gemini-3.1-flash-image-preview' : (model || 'gemini-3.1-flash-image-preview'));

    const API_KEY = isGptImage2
      ? (process.env.IMAGE_GEN_API_KEY_1 || '')
      : isSeedream
        ? (process.env.XG_API_KEY || '')
        : (process.env.IMAGE_GEN_API_KEY_2 || '');

    console.log('📤 Image generation request:', {
      userId,
      parentUserId,
      model: apiModel,
      isGptImage2,
      isSeedream,
      aspectRatio,
      resolution,
      promptLength: prompt?.length
    });

    try {
      // 从数据库获取价格（考虑代理自定义定价）
      const pricingKey = isGptImage2 ? 'gpt_image2_generation' : isSeedream ? 'seedream_generation' : 'nanobann2_generation';
      const COST = await getUserEffectivePricing(parentUserId, pricingKey);
      console.log('💰 COST DEBUG:', { pricingKey, COST, isGptImage2, parentUserId });

      const mainUser = await userDb.findById(parentUserId);
      const totalCost = COST * generateCount;

      if (!mainUser || mainUser.credits < totalCost) {
        console.error('❌ Insufficient credits:', mainUser?.credits, 'need:', totalCost);
        return res.status(400).json({ error: `积分不足，需要 ${totalCost} 积分，当前 ${mainUser?.credits || 0} 积分` });
      }

      const payload: any = {
        model: apiModel,
        prompt: prompt,
        n: generateCount,
      };

      const sizeMap: Record<string, { w: number; h: number }> = {
        '1:1': { w: 1024, h: 1024 },
        '2:3': { w: 1024, h: 1536 },
        '3:2': { w: 1536, h: 1024 },
        '3:4': { w: 1024, h: 1360 },
        '4:3': { w: 1360, h: 1024 },
        '4:5': { w: 1024, h: 1280 },
        '5:4': { w: 1280, h: 1024 },
        '9:16': { w: 1024, h: 2048 },
        '16:9': { w: 2048, h: 1152 },
        '21:9': { w: 2560, h: 1088 },
        '1:4': { w: 768, h: 2048 },
        '4:1': { w: 2048, h: 768 },
        '1:8': { w: 768, h: 4096 },
        '8:1': { w: 4096, h: 768 },
      };

      // 根据分辨率缩放尺寸
      const resScale = resolution?.toLowerCase() === '4k' ? 4 : resolution?.toLowerCase() === '2k' ? 2 : 1;
      const getScaledSize = (ar: string): string => {
        const base = sizeMap[ar] || { w: 1024, h: 1024 };
        return `${base.w * resScale}x${base.h * resScale}`;
      };

      if (aspectRatio && aspectRatio !== '智能' && aspectRatio !== 'auto') {
        if (isSeedream) {
          // seedream: 用 quality 控制分辨率，不传 size（避免冲突）
          payload.aspect_ratio = aspectRatio;
          payload.quality = resolution?.toLowerCase() === '4k' ? '4k' : resolution?.toLowerCase() === '2k' ? '2k' : '1k';
          payload.response_format = 'url';
        } else if (isGptImage2) {
          // gpt-image-2: aspect_ratio + 按分辨率缩放 size
          payload.aspect_ratio = aspectRatio;
          payload.size = getScaledSize(aspectRatio);
          payload.response_format = 'url';
        } else {
          // nanobann2 等：按分辨率缩放 size
          payload.aspect_ratio = aspectRatio;
          payload.size = getScaledSize(aspectRatio);
        }
      }

      // 获取多张图片URL（generations API 原生支持 n）
      let rawImageUrls: string[] = [];
      try {
        console.log('generations API:', { model: apiModel, isGptImage2, n: generateCount, payload });
        const resp = await axios.post('https://api.xgapi.top/v1/images/generations', payload, {
          headers: { Authorization: 'Bearer ' + API_KEY, 'Content-Type': 'application/json' }, timeout: 300000
        });
        console.log('generations API response:', JSON.stringify(resp.data).substring(0, 500));
        if (resp.data?.data) {
          rawImageUrls = resp.data.data.map((item: any) => item.url).filter(Boolean);
        }
      } catch (e) { console.log('generations failed:', e.message); }

      // fallback: chat completions（只取1张）
      if (rawImageUrls.length === 0 && !isGptImage2 && !isSeedream) {
        try {
          const chatPayload = {
            model: apiModel,
            messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
            extra_body: { google: { image_config: { aspect_ratio: (aspectRatio && aspectRatio !== '智能') ? aspectRatio : '16:9' } } }
          };
          const cr = await axios.post('https://api.xgapi.top/v1/chat/completions', chatPayload, {
            headers: { Authorization: 'Bearer ' + API_KEY, 'Content-Type': 'application/json' }, timeout: 300000
          });
          const d = cr.data;
          let url = '';
          if (d?.choices?.[0]?.message?.content) {
            const c = d.choices[0].message.content;
            if (c.startsWith('http')) url = c;
            else { const m = c.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/); if (m) url = m[1]; }
          }
          if (!url && d?.data?.[0]?.url) url = d.data[0].url;
          if (!url && d?.url) url = d.url;
          if (url) rawImageUrls.push(url);
        } catch (e) { console.log('chat failed:', e.message); }
      }

      if (rawImageUrls.length === 0) return res.status(500).json({ error: '图片生成失败，未获取到图片URL' });

      // ★ 先扣费再返回（按实际生成的图片张数）
      const actualCost = COST * rawImageUrls.length;
      const modelLabel = isSeedream ? '(Seedream)' : isGptImage2 ? '(GPT-Image2)' : '';
      await creditTransactionDb.deduct(parentUserId, actualCost, 'generate', `图片生成${modelLabel}${rawImageUrls.length > 1 ? `(x${rawImageUrls.length})` : ''}${req.user.isSubUser ? '(子账号)' : ''}`, parentUserId, subUserId);
      await handleConsumptionCommission(parentUserId, actualCost, 'consume', pricingKey);
      const updatedUser = await userDb.findById(parentUserId);

      // ★ 同步写库：立即把 API URL 写入 generated_images（type=chatgen），用户刷新不会丢
      for (const rawUrl of rawImageUrls) {
        await generatedImagesDb.create(userId, rawUrl, prompt, {
          model: apiModel, aspectRatio: aspectRatio || '智能', resolution: resolution || '1K',
          type: 'chatgen', parentUserId: subUserId ? parentUserId : undefined
        }).catch(err => console.error('同步写库失败:', err));
      }

      // ★ 立即返回 API 原始 URL（用户先看到图片）
      res.json({
        data: rawImageUrls.map(url => ({ url })),
        remainingCredits: updatedUser?.credits || 0
      });

      // ★ 后台异步：并行下载 + 上传 COS，然后更新 DB 中的 URL
      (async () => {
        try {
          await Promise.all(rawImageUrls.map(async (rawUrl) => {
            try {
              const ir = await axios.get(rawUrl, { responseType: 'arraybuffer', timeout: 30000,
                headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://softhooky.com/', 'Accept': 'image/*' }, maxRedirects: 5 });
              const imageBuffer = Buffer.from(ir.data);
              const cosUrl = await uploadToCosWithRetry(imageBuffer, getExtensionFromUrl(rawUrl), parentUserId, subUserId);
              // 将 DB 中的 API URL 替换为 COS URL
              await pool.execute(
                'UPDATE generated_images SET image_url = ? WHERE user_id = ? AND image_url = ? AND type = ?',
                [cosUrl, userId, rawUrl, 'chatgen']
              );
            } catch (err) {
              console.error('异步上传COS失败:', err);
            }
          }));
          console.log('✅ 异步COS上传完成');
        } catch (err) {
          console.error('异步COS上传异常:', err);
        }
      })();
    } catch (error: any) {
      console.error("Image generation error:", error.message);
      console.error("Error details:", {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message
      });
      res.status(error.response?.status || 500).json(
        { error: error.response?.data?.error?.message || error.response?.data?.error || error.response?.data?.message || error.message || '图片生成失败' }
      );
    }
  });

  // API Route for Image Edit
  app.post("/api/images/edits", authMiddleware, async (req: any, res: any) => {
    const { prompt, images, model, size, quality, aspectRatio } = req.body;
    const userId = req.user.id;
    const parentUserId = req.user.parentUserId || req.user.id;
    const subUserId = req.user.isSubUser ? userId : undefined;

    // 根据模型选择不同的 API 密钥和扣费
    const isGptImage2 = model === 'gpt-image-2';
    const isSeedream = model === 'seedream';
    const apiModel = isGptImage2
      ? 'gpt-image-2'
      : isSeedream
        ? 'seedream-5.0'
        : (model === 'nanobann2' ? 'gemini-3.1-flash-image-preview' : (model || 'gemini-3.1-flash-image-preview'));

    const API_KEY = isGptImage2
      ? (process.env.IMAGE_GEN_API_KEY_1 || '')
      : isSeedream
        ? (process.env.XG_API_KEY || '')
        : (process.env.IMAGE_GEN_API_KEY_2 || '');

    console.log('📥 /api/images/edits request received!');
    const bodyForLog: any = { ...req.body };
    if (bodyForLog.images) {
      bodyForLog.images = bodyForLog.images.map((img: string) =>
        img?.startsWith('data:image/') ? `[base64 ${img.substring(11, 20)}...]` : img?.substring(0, 100)
      );
    }
    console.log('📥 Request body keys:', Object.keys(req.body));
    console.log('📥 Request body:', JSON.stringify(bodyForLog).substring(0, 500));
    console.log('📥 /api/images/edits request:', {
      prompt: prompt?.substring(0, 100),
      imagesCount: images?.length,
      model: apiModel,
      isGptImage2,
      isSeedream,
      size,
      quality,
      aspectRatio
    });

    if (!images || !Array.isArray(images) || images.length === 0) {
      console.error('❌ Invalid images parameter:', images);
      return res.status(400).json({ error: "At least one image is required for editing" });
    }

    try {
      // 从数据库获取价格（考虑代理自定义定价）
      const pricingKey = isGptImage2 ? 'gpt_image2_edit' : isSeedream ? 'seedream_edit' : 'nanobann2_edit';
      const COST = await getUserEffectivePricing(parentUserId, pricingKey);
      console.log('💰 EDIT COST DEBUG:', { pricingKey, COST, isGptImage2, isSeedream, parentUserId });

      const mainUser = await userDb.findById(parentUserId);
      
      if (!mainUser || mainUser.credits < COST) {
        return res.status(400).json({ error: "积分不足，无法编辑图片" });
      }

      // 先下载/解码所有图片为 Buffer，避免重试时 FormData 被消费空
      interface ImageData {
        buffer: Buffer;
        extension: string;
      }
      const imageBuffers: ImageData[] = [];

      for (let i = 0; i < images.length; i++) {
        const imageInput = images[i];
        let imageBuffer: Buffer | null = null;
        let extension = 'png';
        
        try {
          if (typeof imageInput === 'string' && imageInput.startsWith('data:image/')) {
            console.log(`Processing base64 image ${i + 1}/${images.length}`);
            const parts = imageInput.split(',');
            if (parts.length !== 2) {
              throw new Error('Invalid base64 format');
            }
            const base64Data = parts[1];
            if (!base64Data || base64Data.length === 0) {
              throw new Error('Invalid base64 format: no data after comma');
            }
            
            imageBuffer = Buffer.from(base64Data, 'base64');
            extension = imageInput.match(/data:image\/(\w+)/)?.[1] || 'png';
            console.log(`Base64 image ${i + 1} decoded: ${imageBuffer.length} bytes, extension: ${extension}`);
          } else if (typeof imageInput === 'string') {
            console.log(`Downloading remote image ${i + 1}/${images.length}: ${imageInput.substring(0, 100)}`);

            const imageResponse = await axios.get(imageInput, {
              responseType: 'arraybuffer',
              timeout: 300000,
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'image/*'
              }
            });

            const contentType = imageResponse.headers['content-type'];
            console.log(`Downloaded content-type: ${contentType}`);

            if (contentType && typeof contentType === 'string' && !contentType.startsWith('image/')) {
              throw new Error(`图片URL无法访问（Content-Type: ${contentType}），可能是因为：1) 图片正在上传中请稍后重试；2) 图片链接已过期；3) 该图片不支持被服务器下载`);
            }

            imageBuffer = Buffer.from(imageResponse.data);
            extension = getExtensionFromUrl(imageInput);
          } else {
            throw new Error(`Invalid image input type: ${typeof imageInput}`);
          }
          
          console.log(`Image ${i + 1} processed: ${imageBuffer.length} bytes`);
          
          if (!imageBuffer || imageBuffer.length === 0) {
            return res.status(400).json({ error: `图片${i + 1}为空或无效` });
          }
          
          imageBuffers.push({ buffer: imageBuffer, extension });
        } catch (downloadError: any) {
          console.error(`Failed to process image ${i + 1}:`, downloadError.message);
          return res.status(400).json({ error: `无法处理图片${i + 1}: ${downloadError.message}` });
        }
      }

      console.log('All images processed:', imageBuffers.length, 'images ready');
      
      // 重试循环
      let apiResponse: any = null;
      let lastError: any = null;
      const maxRetries = 2;

      for (let retryCount = 0; retryCount <= maxRetries; retryCount++) {
        try {
          if (apiModel === 'gpt-image-2' || apiModel === 'seedream-5.0') {
            // gpt-image-2 / seedream: 使用 images/edits API (FormData 方式上传)
            const editFormData = new FormData();
            editFormData.append('model', apiModel);
            editFormData.append('prompt', prompt);

            // 将所有图片都作为 image 字段上传，API 自行处理多张图
            imageBuffers.forEach((img, index) => {
              editFormData.append('image', img.buffer, {
                filename: `image_${index}.${img.extension}`,
                contentType: `image/${img.extension === 'jpg' ? 'jpeg' : img.extension}`
              });
            });

            // 根据分辨率缩放尺寸
            const editResScale = quality?.toLowerCase() === '4k' ? 4 : quality?.toLowerCase() === '2k' ? 2 : 1;
            const editSizeMap: Record<string, { w: number; h: number }> = {
              '1:1': { w: 1024, h: 1024 }, '2:3': { w: 1024, h: 1536 }, '3:2': { w: 1536, h: 1024 },
              '3:4': { w: 1024, h: 1360 }, '4:3': { w: 1360, h: 1024 }, '4:5': { w: 1024, h: 1280 },
              '5:4': { w: 1280, h: 1024 }, '9:16': { w: 1024, h: 2048 }, '16:9': { w: 2048, h: 1152 },
              '21:9': { w: 2560, h: 1088 }, '1:4': { w: 768, h: 2048 }, '4:1': { w: 2048, h: 768 },
              '1:8': { w: 768, h: 4096 }, '8:1': { w: 4096, h: 768 },
            };

            if (aspectRatio && aspectRatio !== '智能' && aspectRatio !== 'auto') {
              editFormData.append('aspect_ratio', aspectRatio);
              if (isSeedream) {
                // seedream: quality 控制分辨率，不传 size
                editFormData.append('quality', quality || '1k');
                editFormData.append('response_format', 'url');
              } else {
                // gpt-image-2: 按分辨率缩放 size
                const base = editSizeMap[aspectRatio] || { w: 1024, h: 1024 };
                editFormData.append('size', `${base.w * editResScale}x${base.h * editResScale}`);
              }
            }

            if (retryCount === 0) {
              console.log(`Calling images/edits API for ${apiModel}`);
              console.log('- model:', apiModel);
              console.log('- prompt:', prompt);
              console.log('- images count:', imageBuffers.length);
            } else {
              console.log(`Retrying images/edits (attempt ${retryCount + 1}/${maxRetries + 1})...`);
            }

            const editResponse = await axios.post("https://api.xgapi.top/v1/images/edits", editFormData, {
              headers: {
                'Authorization': `Bearer ${API_KEY}`,
                ...editFormData.getHeaders()
              },
              maxBodyLength: Infinity,
              timeout: 300000
            });

            console.log('✅ Images/edits response:', JSON.stringify(editResponse.data).substring(0, 500));

            // 从 images/edits 响应中提取图片 URL
            const imageUrls: string[] = [];
            const editData = editResponse.data;

            // 1. 标准 images/edits 格式: { data: [{ url: "..." }] }
            if (editData?.data) {
              const dataArray = Array.isArray(editData.data) ? editData.data : [editData.data];
              dataArray.forEach((item: any) => {
                if (item.url) imageUrls.push(item.url);
                else if (item.b64_json) imageUrls.push(`data:image/png;base64,${item.b64_json}`);
              });
            }
            // 2. 从顶层 url 字段提取
            if (imageUrls.length === 0 && editData?.url) {
              imageUrls.push(editData.url);
            }

            // 包装为统一格式 { data: [{ url }] }
            apiResponse = {
              data: {
                data: imageUrls.map(url => ({ url }))
              }
            };
            console.log('Extracted image URLs:', imageUrls.length > 0 ? imageUrls : '(none)');
          } else {
            // nanobann2: 使用 chat completions API (图生图模式)
            // 将图片 Buffer 转为 base64 data URL
            const imageContents = imageBuffers.map(img => ({
              type: 'image_url',
              image_url: {
                url: `data:image/${img.extension === 'jpg' ? 'jpeg' : img.extension};base64,${img.buffer.toString('base64')}`
              }
            }));

            const chatPayload: any = {
              model: apiModel,
              messages: [
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: prompt },
                    ...imageContents
                  ]
                }
              ],
              extra_body: {
                google: {
                  image_config: {
                    aspect_ratio: (aspectRatio && aspectRatio !== "智能") ? aspectRatio : "16:9"
                  }
                }
              }
            };

            if (retryCount === 0) {
              console.log('Calling chat completions API with images (nanobann2 图生图)');
              console.log('- model:', apiModel);
              console.log('- prompt:', prompt);
              console.log('- images count:', imageBuffers.length);
              console.log('- aspectRatio:', aspectRatio);
            } else {
              console.log(`Retrying chat completions (attempt ${retryCount + 1}/${maxRetries + 1})...`);
            }

            const chatResponse = await axios.post("https://api.xgapi.top/v1/chat/completions", chatPayload, {
              headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
              },
              timeout: 300000
            });

            console.log('✅ Chat completions response:', JSON.stringify(chatResponse.data).substring(0, 500));

            // 从 chat completions 响应中提取图片 URL
            const imageUrls: string[] = [];
            const chatData = chatResponse.data;

            // 1. 从 choices[0].message.content 提取
            if (chatData?.choices?.[0]?.message?.content) {
              const content = chatData.choices[0].message.content;
              if (content.startsWith('data:image/') || content.startsWith('http://') || content.startsWith('https://')) {
                imageUrls.push(content);
              } else {
                const mdMatch = content.match(/!\[.*?\]\(((?:https?:\/\/|data:image\/)[^\s)]+)\)/);
                if (mdMatch) {
                  imageUrls.push(mdMatch[1]);
                }
              }
            }

            // 2. 从 data.data[0].url 提取 (兼容 images/generations 格式)
            if (imageUrls.length === 0 && chatData?.data?.[0]?.url) {
              imageUrls.push(chatData.data[0].url);
            }
            // 3. 从顶层 url 字段提取
            if (imageUrls.length === 0 && chatData?.url) {
              imageUrls.push(chatData.url);
            }
            // 4. 从 image_url 字段提取
            if (imageUrls.length === 0 && chatData?.image_url) {
              imageUrls.push(chatData.image_url);
            }

            // 包装为统一格式 { data: [{ url }] }
            apiResponse = {
              data: {
                data: imageUrls.map(url => ({ url }))
              }
            };
            console.log('Extracted image URLs:', imageUrls.length > 0 ? imageUrls : '(none)');
          }

          break;
        } catch (apiError: any) {
          lastError = apiError;
          console.error(`API call failed (attempt ${retryCount + 1}/${maxRetries + 1}):`, apiError.message);
          
          if (retryCount < maxRetries) {
            const delay = Math.min(10000, (retryCount + 1) * 3000);
            console.log(`⏳ Waiting ${delay}ms before retry...`);
            await new Promise(r => setTimeout(r, delay));
          } else {
            throw lastError;
          }
        }
      }

      if (!apiResponse) {
        throw lastError || new Error('Failed to call external API');
      }

      const response = apiResponse;

      const imageItems = response.data?.data || [];
      const rawUrls = imageItems.map((item: any) => item.url).filter(Boolean);

      if (rawUrls.length === 0) {
        console.error('❌ 编辑后没有获取到任何图片URL，不扣费');
        return res.status(500).json({ error: '图片编辑成功但未获取到图片URL，请重试' });
      }

      // ★ 先扣费再返回
      const modelLabel = isSeedream ? '(Seedream)' : isGptImage2 ? '(GPT-Image2)' : '';
      await creditTransactionDb.deduct(parentUserId, COST, 'edit', `图片编辑${modelLabel}${req.user.isSubUser ? '(子账号)' : ''}`, parentUserId, subUserId);
      await handleConsumptionCommission(parentUserId, COST, 'consume', pricingKey);
      const updatedUser = await userDb.findById(parentUserId);

      // ★ 同步写库：先把 API URL 写入 DB，防刷新丢失
      const editType = isSeedream ? 'chatgen' : 'edited';
      for (const rawUrl of rawUrls) {
        await generatedImagesDb.create(userId, rawUrl, prompt, {
          model: apiModel, aspectRatio: aspectRatio || '智能', resolution: '1K',
          type: editType, parentUserId: subUserId ? parentUserId : undefined
        }).catch(err => console.error('同步写库失败(edits):', err));
      }

      // ★ 立即返回 API 原始 URL
      res.json({
        data: rawUrls.map(url => ({ url })),
        remainingCredits: updatedUser?.credits || 0
      });

      // ★ 后台异步：并行下载 + 上传 COS，然后更新 DB 中的 URL
      (async () => {
        try {
          await Promise.all(rawUrls.map(async (rawUrl: string) => {
            try {
              const ir = await axios.get(rawUrl, {
                responseType: 'arraybuffer', timeout: 30000,
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                  'Referer': 'https://softhooky.com/',
                  'Accept': 'image/*,*/*',
                  'Cache-Control': 'no-cache'
                }, maxRedirects: 5
              });
              const imageBuffer = Buffer.from(ir.data);
              const cosUrl = await uploadToCosWithRetry(imageBuffer, getExtensionFromUrl(rawUrl), parentUserId, subUserId);
              await pool.execute(
                'UPDATE generated_images SET image_url = ? WHERE user_id = ? AND image_url = ? AND type = ?',
                [cosUrl, userId, rawUrl, editType]
              );
            } catch (err) {
              console.error('异步上传COS失败(edits):', err);
            }
          }));
          console.log('✅ 编辑图片异步COS上传完成');
        } catch (err) {
          console.error('异步COS上传异常(edits):', err);
        }
      })();
    } catch (error: any) {
      console.error("Image edit error:", error.message);
      console.error("Error stack:", error.stack);
      console.error("Error response:", error.response?.data);
      console.error("Error status:", error.response?.status);
      
      let errorMessage = String(error.response?.data?.error || error.message || "Failed to edit image");
      
      if (errorMessage.includes("does not support image") || errorMessage.includes("image input")) {
        errorMessage = "当前 API Key 或模型不支持图片输入功能。请检查：1) API Key 是否有效；2) 使用的模型是否支持图片编辑；3) 联系客服升级您的套餐。";
      } else if (errorMessage.includes("Invalid image")) {
        errorMessage = "图片格式无效，请上传有效的图片文件（JPG、PNG 等）";
      } else if (error.response?.status === 401) {
        errorMessage = "API Key 无效或已过期，请检查设置";
      } else if (error.response?.status === 403) {
        errorMessage = "API Key 没有图片编辑权限。请检查：1) API Key 是否有效；2) 使用的模型是否支持图片编辑；3) 联系客服升级您的套餐。";
      }
      
      res.status(error.response?.status || 500).json({ error: errorMessage });
    }
  });

  // ==================== 产品融图 API ====================

  // 产品融合生成
  app.post("/api/product-fusion/generate", authMiddleware, async (req: any, res: any) => {
    const { productImages, scene, aspectRatio } = req.body;
    const userId = req.user.id;
    const parentUserId = req.user.parentUserId || req.user.id;
    const subUserId = req.user.isSubUser ? userId : undefined;

    console.log("Product fusion request:", { productImages: productImages?.length, scene, aspectRatio });

    if (!productImages || !Array.isArray(productImages) || productImages.length === 0) {
      return res.status(400).json({ error: "请上传产品图片" });
    }

    if (!scene) {
      return res.status(400).json({ error: "请选择场景" });
    }

    try {
      // 从数据库获取价格（使用nanobann2_generation，考虑代理自定义定价）
      const COST = await getUserEffectivePricing(parentUserId, 'nanobann2_generation');
      const mainUser = await userDb.findById(parentUserId);
      const apiKey = process.env.IMAGE_GEN_API_KEY_2 || '';

      if (!mainUser || mainUser.credits < COST) {
        return res.status(400).json({ error: "积分不足，需要 " + COST + " 积分" });
      }

      // 构建融合提示词
      const fusionPrompt = `你是一个专业的AI视觉优化师。请完成以下任务：
1. 精修产品图：修复瑕疵、去除褶皱、精准抠图
2. 分析场景"${scene}"：理解场景的核心元素和氛围
3. 生成背景：根据"${scene}"生成符合的精美背景
4. 融合产品：将精修后的产品自然融入背景，确保光影统一、真实自然

产品图片：${productImages.join(', ')}
目标场景：${scene}
输出要求：画面清晰锐利，产品与背景光影一致，融合自然真实，细节丰富`;

      // 调用图片生成API
      const response = await axios.post("https://api.xgapi.top/v1/images/generations", {
        prompt: fusionPrompt,
        model: "gemini-3.1-flash-image-preview",
        aspect_ratio: aspectRatio || "3:4",
        response_format: "url"
      }, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 180000
      });

      if (response.data && response.data.length > 0) {
        const generatedUrl = response.data[0].url;

        // 扣除积分（从主账号扣除）
        try {
          await creditTransactionDb.deduct(parentUserId, COST, 'product_fusion', `产品融图-${scene}${req.user.isSubUser ? '(子账号)' : ''}`, parentUserId, subUserId);

          // 代理佣金
          await handleConsumptionCommission(parentUserId, COST, 'consume', 'nanobann2_generation');
        } catch (deductError: any) {
          console.error('扣除积分失败:', deductError.message);
        }

        // 获取最新积分
        const updatedUser = await userDb.findById(parentUserId);

        // 立即返回临时URL，异步上传到COS
        (async () => {
          try {
            console.log(`🔄 开始异步上传到COS...`);
            const imageResponse = await axios.get(generatedUrl, {
              responseType: 'arraybuffer',
              headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://softhooky.com/',
                'Accept': '*/*'
              }
            });
            const imageBuffer = Buffer.from(imageResponse.data);
            const extension = generatedUrl.split('.').pop()?.split('?')[0] || 'png';
            const cosUrl = await uploadToCosWithRetry(imageBuffer, extension, parentUserId, subUserId);
            console.log(`✅ 图片已上传到COS: ${cosUrl}`);

            // 先保存临时URL到数据库
            await generatedImagesDb.create(userId, generatedUrl, `产品融图-${scene}`, {
              model: 'gemini-3.1-flash-image-preview',
              aspectRatio: aspectRatio || '3:4',
              type: 'generated',
              parentUserId: subUserId ? parentUserId : undefined
            });

            // 更新为COS URL
            const updatedRows = await generatedImagesDb.updateUrlByTempUrl(generatedUrl, cosUrl);
            if (updatedRows === 0) {
              console.warn(`⚠️ 产品融图临时URL记录更新失败，创建新记录`);
              await generatedImagesDb.create(userId, generatedUrl, `产品融图-${scene}`, {
                model: 'gemini-3.1-flash-image-preview',
                aspectRatio: aspectRatio || '3:4',
                type: 'generated',
                parentUserId: subUserId ? parentUserId : undefined
              });
            }
            console.log(`✅ 数据库URL已更新为COS地址`);
          } catch (uploadError: any) {
            console.error(`❌ 异步上传到COS失败:`, uploadError.message);
            // 保存临时URL到数据库
            try {
              await generatedImagesDb.create(userId, generatedUrl, `产品融图-${scene}`, {
                model: 'gemini-3.1-flash-image-preview',
                aspectRatio: aspectRatio || '3:4',
                type: 'generated',
                parentUserId: subUserId ? parentUserId : undefined
              });
            } catch (dbError) {
              console.error('保存临时URL到DB失败:', dbError);
            }
          }
        })();

        return res.json({
          success: true,
          imageUrl: generatedUrl,
          prompt: fusionPrompt,
          remainingCredits: updatedUser?.credits || 0
        });
      } else {
        return res.status(500).json({ error: "生成失败，未返回图片" });
      }
    } catch (error: any) {
      console.error("Product fusion error:", error.response?.data || error.message);
      res.status(error.response?.status || 500).json({ error: error.response?.data?.error?.message || error.response?.data?.error || error.response?.data?.message || error.message || '产品融图失败' });
    }
  });

  // ==================== COS 图片上传 API ====================

  // 上传图片到 COS
  app.post("/api/images/upload-to-cos", authMiddleware, async (req, res) => {
    const { imageUrl } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ error: "Image URL is required" });
    }

    try {
      console.log("📥 开始下载图片:", imageUrl);
      
      // 下载图片 - 添加更多 headers
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://softhooky.com/',
          'Accept': '*/*'
        },
        timeout: 30000
      });

      const imageBuffer = Buffer.from(response.data);
      console.log("📥 图片下载完成, 大小:", imageBuffer.length);

      // 生成文件名
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 8);
      const extension = imageUrl.split('.').pop()?.split('?')[0] || 'png';
      const fileName = `generated-${timestamp}-${randomStr}.${extension}`;

      // 上传到 COS
      const command = new PutObjectCommand({
        Bucket: process.env.COS_BUCKET!,
        Key: fileName,
        Body: imageBuffer,
        ContentType: String(response.headers['content-type'] || 'image/png'),
      });

      await cosClient.send(command);

      // 返回公开访问 URL
      const publicUrl = `${process.env.COS_PUBLIC_URL}/${fileName}`;
      console.log('✅ 图片已上传到 COS:', publicUrl);

      res.json({ 
        success: true, 
        url: publicUrl,
        originalUrl: imageUrl
      });
    } catch (error: any) {
      console.error("COS upload error:", error.message || error);
      console.error("Error details:", error.response?.data || error.stack);
      res.status(500).json({ error: "Failed to upload image to COS: " + (error.message || 'Unknown error') });
    }
  });

  // 上传文件到 COS（直接接收文件）
  app.post("/api/images/upload-file-to-cos", authMiddleware, async (req, res) => {
    try {
      // 解析 multipart/form-data
      const formData = new FormData();
      
      // 从请求体中读取数据
      const contentType = req.headers['content-type'] || '';
      console.log("Content-Type:", contentType);

      // 使用全局 cosClient 单例

      // 生成文件名
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 8);
      
      // 尝试从 content-disposition 获取文件名
      let fileName = `upload-${timestamp}-${randomStr}.png`;
      let fileBuffer = Buffer.from([]);
      
      // 如果有 body，尝试解析
      if (req.body && Object.keys(req.body).length > 0) {
        // 检查是否有 file 数据
        const bodyStr = JSON.stringify(req.body);
        if (bodyStr.includes('file')) {
          // 简单处理：直接使用时间戳命名
          fileBuffer = Buffer.from(bodyStr);
        }
      }

      // 尝试从原始请求读取文件
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });
      
      await new Promise<void>((resolve) => {
        req.on('end', () => {
          const fullBody = Buffer.concat(chunks);
          // 尝试提取文件数据（简化处理）
          fileBuffer = fullBody;
          resolve();
        });
      });

      // 如果没有有效数据，返回错误
      if (fileBuffer.length === 0) {
        return res.status(400).json({ error: "No file data received" });
      }

      const extension = fileName.split('.').pop() || 'png';
      fileName = `upload-${timestamp}-${randomStr}.${extension}`;

      // 上传到 COS
      const command = new PutObjectCommand({
        Bucket: process.env.COS_BUCKET!,
        Key: fileName,
        Body: fileBuffer,
        ContentType: 'image/png',
      });

      await cosClient.send(command);

      // 返回公开访问 URL
      const publicUrl = `${process.env.COS_PUBLIC_URL}/${fileName}`;
      console.log('✅ 文件已上传到 COS:', publicUrl);

      res.json({ 
        success: true, 
        url: publicUrl
      });
    } catch (error: any) {
      console.error("File upload error:", error);
      res.status(500).json({ error: "Failed to upload file to COS: " + error.message });
    }
  });

  // 上传 base64 图片到 COS
  app.post("/api/images/upload-base64-to-cos", authMiddleware, async (req, res) => {
    const { base64, mimeType, fileName: originalName } = req.body;

    if (!base64) {
      return res.status(400).json({ error: "Base64 data is required" });
    }

    try {
      // 使用全局 cosClient 单例

      // 解码 base64
      const imageBuffer = Buffer.from(base64, 'base64');

      // 生成文件名
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 8);
      const extension = originalName?.split('.').pop() || mimeType?.split('/')[1] || 'png';
      const fileName = `upload-${timestamp}-${randomStr}.${extension}`;

      // 上传到 COS
      const command = new PutObjectCommand({
        Bucket: process.env.COS_BUCKET!,
        Key: fileName,
        Body: imageBuffer,
        ContentType: mimeType || 'image/png',
      });

      await cosClient.send(command);

      // 返回公开访问 URL
      const publicUrl = `${process.env.COS_PUBLIC_URL}/${fileName}`;
      console.log('✅ Base64 图片已上传到 COS:', publicUrl);

      res.json({ 
        success: true, 
        url: publicUrl
      });
    } catch (error: any) {
      console.error("Base64 upload error:", error);
      res.status(500).json({ error: "Failed to upload base64 image to COS: " + error.message });
    }
  });

  // 批量上传图片到 COS
  app.post("/api/images/batch-upload-to-cos", authMiddleware, async (req, res) => {
    const { imageUrls } = req.body;

    if (!imageUrls || !Array.isArray(imageUrls)) {
      return res.status(400).json({ error: "Image URLs array is required" });
    }

    try {
      // 使用全局 cosClient 单例

      const uploadPromises = imageUrls.map(async (imageUrl: string) => {
        // 下载图片
        const response = await axios.get(imageUrl, {
          responseType: 'arraybuffer',
          headers: {
            'User-Agent': 'Mozilla/5.0'
          }
        });

        const imageBuffer = Buffer.from(response.data);

        // 生成文件名
        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substring(2, 8);
        const extension = imageUrl.split('.').pop()?.split('?')[0] || 'png';
        const fileName = `generated-${timestamp}-${randomStr}.${extension}`;

        // 上传到 COS
        const command = new PutObjectCommand({
          Bucket: process.env.COS_BUCKET!,
          Key: fileName,
          Body: imageBuffer,
          ContentType: String(response.headers['content-type'] || 'image/png'),
        });

        await cosClient.send(command);

        // 返回公开访问 URL
        const publicUrl = `${process.env.COS_PUBLIC_URL}/${fileName}`;
        return { success: true, url: publicUrl, originalUrl: imageUrl };
      });

      const results = await Promise.all(uploadPromises);

      res.json({
        success: true,
        images: results
      });
    } catch (error: any) {
      console.error("Batch COS upload error:", error);
      res.status(500).json({ error: "Failed to batch upload images to COS" });
    }
  });

  // ==================== 代理下载图片（解决CORS问题） ====================
  app.get("/api/images/proxy", async (req: any, res: any) => {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({ error: "url parameter is required" });
    }

    try {
      console.log('🌐 代理下载图片:', url.substring(0, 100));
      
      const imageResponse = await axios.get(url, { 
        responseType: 'arraybuffer',
        timeout: 60000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
          'Referer': 'https://softhooky.com/',
          'Cache-Control': 'no-cache'
        },
        validateStatus: (status) => status < 500 // Allow 404, 403 etc to be handled
      });
      
      if (imageResponse.status !== 200) {
        console.error(`❌ 源服务器返回错误状态: ${imageResponse.status}`);
        return res.status(imageResponse.status).json({ 
          error: `Source returned ${imageResponse.status}`,
          url: url.substring(0, 100)
        });
      }
      
      const contentType = imageResponse.headers['content-type'] || 'image/png';
      res.set('Content-Type', contentType);
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Cache-Control', 'public, max-age=3600');
      res.send(imageResponse.data);
      
      console.log('✅ 代理下载成功:', url.substring(0, 50), 'Size:', imageResponse.data?.length);
    } catch (error: any) {
      console.error("❌ 代理下载失败:", error.message);
      console.error("URL:", url?.substring(0, 100));
      
      if (error.response) {
        console.error("响应状态:", error.response.status);
        console.error("响应头:", error.response.headers);
      }
      
      res.status(500).json({ 
        error: "Failed to download image", 
        details: error.message,
        url: url?.substring(0, 100)
      });
    }
  });

  // ==================== PDF文件上传接口 ====================
  app.post("/api/upload/pdf", authMiddleware, async (req: any, res) => {
    try {
      const { fileName, base64Data, contentType } = req.body;

      if (!base64Data || !fileName) {
        return res.status(400).json({ success: false, error: '缺少文件数据' });
      }

      // 验证文件类型
      if (!fileName.toLowerCase().endsWith('.pdf') && contentType !== 'application/pdf') {
        return res.status(400).json({ success: false, error: '只支持PDF文件' });
      }

      const userId = req.user.id;
      const parentUserId = req.user.parentUserId || req.user.id;

      // 解码base64
      const buffer = Buffer.from(base64Data, 'base64');

      // 上传到COS
      const now = new Date();
      const year = now.getFullYear().toString();
      const month = (now.getMonth() + 1).toString().padStart(2, '0');
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 8);
      const key = `${parentUserId}/${year}/${month}/pdf-${timestamp}-${randomStr}.pdf`;

      const command = new PutObjectCommand({
        Bucket: process.env.COS_BUCKET!,
        Key: key,
        Body: buffer,
        ContentType: 'application/pdf',
      });

      await cosClient.send(command);
      const fileUrl = `${process.env.COS_PUBLIC_URL}/${key}`;

      console.log(`📄 PDF上传成功: ${fileUrl}`);

      res.json({
        success: true,
        url: fileUrl,
        fileName: fileName
      });
    } catch (error: any) {
      console.error('❌ PDF上传失败:', error.message);
      res.status(500).json({ success: false, error: '上传失败' });
    }
  });

  // 电商文案助手 API (Gemini 3.5 flash)
  app.post("/api/chat/deepseek", authMiddleware, async (req: any, res) => {
    try {
      const { messages } = req.body;
      if (!messages || messages.length === 0) {
        return res.status(400).json({ success: false, error: '消息不能为空' });
      }

      const model = 'gemini-3.5-flash';

      const API_KEY = process.env.XG_API_KEY || process.env.IMAGE_GEN_API_KEY;
      if (!API_KEY) {
        return res.status(500).json({ success: false, error: 'API key 未配置' });
      }

      // 检查用户积分是否足够（预扣时按最低扣费检查）
      const chatUserId = (req as any).user?.isSubUser ? (req as any).user?.parentUserId : (req as any).user?.id;
      if (chatUserId) {
        const [users]: any = await pool.execute('SELECT credits FROM users WHERE id = ?', [chatUserId]);
        const userCredits = users?.[0]?.credits || 0;
        if (userCredits < 0.01) {
          return res.status(400).json({ success: false, error: `积分不足，需要至少0.01积分，当前${userCredits}积分` });
        }
      }

      // 按模型选择 API 地址和定价
      const apiUrl = 'https://cdn.xgapi.top/v1/chat/completions';
      const pricingKey = 'deepseek_chat';
      const apiModel = model;

      // 构建请求参数（OpenAI 兼容格式）
      const requestData: any = {
        model: apiModel,
        messages: messages,
        max_tokens: 8192
      };

      const response = await axios.post(apiUrl, requestData, {
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout: 300000,
        }
      );

      // 解析 OpenAI 兼容格式响应
      const content = response.data?.choices?.[0]?.message?.content || '';
      if (!content) {
        console.error('❌ AI 返回空内容:', JSON.stringify(response.data).substring(0, 500));
      }
      const usage = response.data?.usage || {};
      const inputTokens = usage.prompt_tokens || 0;
      const outputTokens = usage.completion_tokens || 0;
      const chatCredits = await getPricing(pricingKey) || 0.01;

      console.log(`✅ AI 响应完成 (${content.length} 字符, model: ${model}, api: ${apiUrl})`);

      // 扣除用户积分
      try {
        if (chatUserId) {
          await pool.execute(
            'UPDATE users SET credits = credits - ? WHERE id = ? AND credits >= ?',
            [chatCredits, chatUserId, chatCredits]
          );
          await pool.execute(
            'INSERT INTO credit_transactions (user_id, amount, type, description, created_at) VALUES (?, ?, ?, ?, NOW())',
            [chatUserId, -chatCredits, 'consumption', `AI文案对话(${model})`]
          );
          // 代理佣金
          await handleConsumptionCommission(chatUserId, geminiCredits, 'consume', 'deepseek_chat');
        }
      } catch (creditError) {
        console.error('扣除积分失败:', creditError);
      }

      res.json({
        success: true,
        content,
        model,
        credits: chatCredits,
        usage: { inputTokens, outputTokens },
      });
    } catch (error: any) {
      console.error('❌ Gemini API 错误:', error.message);
      const isRateLimit = error.response?.data?.error?.message?.includes('rate limit')
        || error.response?.status === 429;
      const errorMsg = isRateLimit
        ? '请求过于频繁，请3-5分钟后再试'
        : (error.response?.data?.error?.message || error.response?.data?.error || error.message || 'DeepSeek 请求失败');
      res.status(500).json({
        success: false,
        error: errorMsg,
      });
    }
  });

  // 保存 Deepseek 聊天消息到数据库
  app.post("/api/chat/deepseek/messages", authMiddleware, async (req: any, res: any) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: '未登录' });
      }

      const { messages } = req.body;
      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ success: false, error: '消息格式错误' });
      }

      // 清空该用户的旧消息
      await pool.execute('DELETE FROM deepseek_chat_messages WHERE user_id = ?', [userId]);

      // 批量插入新消息
      if (messages.length > 0) {
        const values = messages.map((m: any) => [userId, m.type, m.content]);
        const placeholders = values.map(() => '(?, ?, ?)').join(', ');
        await pool.execute(
          `INSERT INTO deepseek_chat_messages (user_id, type, content) VALUES ${placeholders}`,
          values.flat()
        );
      }

      res.json({ success: true, count: messages.length });
    } catch (error: any) {
      console.error('❌ 保存 Deepseek 消息失败:', error.message);
      res.status(500).json({ success: false, error: '保存消息失败' });
    }
  });

  // 加载 Deepseek 聊天消息从数据库
  app.get("/api/chat/deepseek/messages", authMiddleware, async (req: any, res: any) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: '未登录' });
      }

      const [rows]: any = await pool.execute(
        'SELECT type, content, created_at FROM deepseek_chat_messages WHERE user_id = ? ORDER BY id ASC',
        [userId]
      );

      const messages = rows.map((row: any) => ({
        type: row.type,
        content: row.content,
      }));

      res.json({ success: true, messages });
    } catch (error: any) {
      console.error('❌ 加载 Deepseek 消息失败:', error.message);
      res.status(500).json({ success: false, error: '加载消息失败' });
    }
  });

  // 管理员直接充值用户积分
  app.post("/api/admin/recharge-user", adminMiddleware, async (req: any, res) => {
    try {
      const { email, credits } = req.body;
      
      if (!email || !credits || credits <= 0) {
        return res.status(400).json({ success: false, message: '邮箱和积分数量必填且必须大于0' });
      }

      const [users]: any = await pool.execute(
        'SELECT id FROM users WHERE email = ?',
        [email]
      );

      if (!users || users.length === 0) {
        return res.status(404).json({ success: false, message: '用户不存在' });
      }

      const userId = users[0].id;

      // 更新用户积分
      await pool.execute(
        'UPDATE users SET credits = credits + ? WHERE id = ?',
        [credits, userId]
      );
      await pool.execute(
        'INSERT INTO credit_buckets (user_id, total_amount, remaining_amount, source, expires_at) VALUES (?, ?, ?, ?, NULL)',
        [userId, credits, credits, 'recharge']
      );

      // 记录交易
      await pool.execute(
        'INSERT INTO payment_orders (user_id, order_id, amount, status, created_at) VALUES (?, ?, ?, ?, ?)',
        [userId, `admin-recharge-${Date.now()}`, credits, 'completed', new Date()]
      );

      res.json({ 
        success: true, 
        message: `成功为 ${email} 充值 ${credits} 积分`,
        userId,
        credits
      });
    } catch (error: any) {
      console.error('Admin recharge error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // 获取所有价格配置
  app.get("/api/admin/pricing", adminMiddleware, async (req: any, res) => {
    try {
      const [rows]: any = await pool.execute(
        'SELECT id, `key`, name, price, enabled, created_at, updated_at FROM pricing_config ORDER BY id'
      );
      res.json({ success: true, data: rows });
    } catch (error: any) {
      console.error('Get pricing error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // 更新价格配置
  app.put("/api/admin/pricing/:key", adminMiddleware, async (req, res) => {
    try {
      const { key } = req.params;
      const { price, enabled } = req.body;

      if (price === undefined) {
        return res.status(400).json({ success: false, message: '价格必填' });
      }

      const [result]: any = await pool.execute(
        'UPDATE pricing_config SET price = ?, enabled = ? WHERE `key` = ?',
        [price, enabled !== undefined ? (enabled ? 1 : 0) : 1, key]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: '配置不存在' });
      }

      // 清除缓存
      clearPricingCache();

      res.json({ success: true, message: '价格更新成功' });
    } catch (error: any) {
      console.error('Update pricing error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // 获取站点配置（管理员）
  app.get("/api/admin/site-config", adminMiddleware, async (req, res) => {
    try {
      const config = await getSiteConfig();
      res.json({ success: true, data: config });
    } catch (error: any) {
      console.error('获取站点配置失败:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // 更新站点配置
  app.put("/api/admin/site-config", adminMiddleware, async (req, res) => {
    try {
      const { logo_url, icon_url, site_title } = req.body;
      const updates: string[] = [];
      const params: any[] = [];

      if (logo_url !== undefined) { updates.push('logo_url = ?'); params.push(logo_url); }
      if (icon_url !== undefined) { updates.push('icon_url = ?'); params.push(icon_url); }
      if (site_title !== undefined) { updates.push('site_title = ?'); params.push(site_title); }

      if (updates.length === 0) {
        return res.status(400).json({ success: false, message: '没有需要更新的字段' });
      }

      params.push(1);
      await pool.execute(`UPDATE site_config SET ${updates.join(', ')} WHERE id = ?`, params);
      clearSiteConfigCache();

      res.json({ success: true, message: '站点配置更新成功' });
    } catch (error: any) {
      console.error('更新站点配置失败:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // ==================== 优惠券管理 API ====================

  // 创建优惠券
  app.post("/api/admin/coupons", adminMiddleware, async (req: any, res) => {
    try {
      const { code, credits, max_claims, claim_deadline, expire_days } = req.body;
      if (!code || !credits || !claim_deadline) {
        return res.status(400).json({ success: false, message: '请填写必填字段' });
      }
      await pool.execute(
        'INSERT INTO coupons (code, credits, max_claims, claim_deadline, expire_days) VALUES (?, ?, ?, ?, ?)',
        [code.toUpperCase(), credits, max_claims || 0, claim_deadline, expire_days || 30]
      );
      res.json({ success: true, message: '优惠券创建成功' });
    } catch (error: any) {
      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ success: false, message: '优惠券码已存在' });
      }
      console.error('创建优惠券失败:', error);
      res.status(500).json({ success: false, message: '创建失败' });
    }
  });

  // 优惠券列表（分页）
  app.get("/api/admin/coupons", adminMiddleware, async (req: any, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const pageSize = 20;
      const offset = (page - 1) * pageSize;

      const [totalResult] = await pool.execute('SELECT COUNT(*) as total FROM coupons');
      const total = (totalResult as any[])[0].total;

      const [rows] = await pool.execute(
        'SELECT * FROM coupons ORDER BY created_at DESC LIMIT ? OFFSET ?',
        [pageSize, offset]
      );

      res.json({
        success: true,
        data: rows,
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
      });
    } catch (error: any) {
      console.error('获取优惠券列表失败:', error);
      res.status(500).json({ success: false, message: '获取失败' });
    }
  });

  // 更新优惠券
  app.put("/api/admin/coupons/:id", adminMiddleware, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { code, credits, max_claims, claim_deadline, expire_days, is_active } = req.body;
      await pool.execute(
        'UPDATE coupons SET code=?, credits=?, max_claims=?, claim_deadline=?, expire_days=?, is_active=? WHERE id=?',
        [code, credits, max_claims, claim_deadline, expire_days, is_active ? 1 : 0, id]
      );
      res.json({ success: true, message: '更新成功' });
    } catch (error: any) {
      console.error('更新优惠券失败:', error);
      res.status(500).json({ success: false, message: '更新失败' });
    }
  });

  // 删除优惠券
  app.delete("/api/admin/coupons/:id", adminMiddleware, async (req: any, res) => {
    try {
      await pool.execute('DELETE FROM coupons WHERE id = ?', [req.params.id]);
      res.json({ success: true, message: '已删除' });
    } catch (error: any) {
      console.error('删除优惠券失败:', error);
      res.status(500).json({ success: false, message: '删除失败' });
    }
  });

  // ==================== 管理端代理 API ====================

  // 代理列表
  app.get("/api/admin/agents", adminMiddleware, async (req: any, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const result = await userDb.getAllAgents(page);
      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error('获取代理列表失败:', error);
      res.status(500).json({ success: false, message: '获取代理列表失败' });
    }
  });

  // 待审核代理申请列表
  app.get("/api/admin/agent-applications", adminMiddleware, async (req: any, res) => {
    try {
      const [rows] = await pool.execute(
        "SELECT id, email, credits, created_at FROM users WHERE applied_agent = 1 AND is_agent = 0 AND is_enabled = 1 ORDER BY created_at DESC"
      );
      res.json({ success: true, data: rows });
    } catch (error: any) {
      console.error('获取代理申请列表失败:', error);
      res.status(500).json({ success: false, message: '获取失败' });
    }
  });

  // 开启/关闭代理资格
  app.post("/api/admin/agents/:id/toggle", adminMiddleware, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const { isAgent } = req.body;
      // 检查用户是否是管理员，管理员不能设为代理
      if (isAgent) {
        const user = await userDb.findById(id);
        if (!user) return res.status(404).json({ success: false, message: '用户不存在' });
        if (user.is_admin) {
          return res.status(400).json({ success: false, message: '管理员不能设置为代理' });
        }
        // 清除申请标记，设为代理
        await pool.execute('UPDATE users SET is_agent = 1, applied_agent = 0 WHERE id = ?', [id]);
        // 发送通知邮件给用户
        console.log('📧 正在发送代理开通通知邮件到:', user.email);
        try {
          const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.163.com',
            port: 465, secure: true,
            auth: { user: process.env.SMTP_USER || 'softhooky@163.com', pass: process.env.SMTP_PASS || '' }
          });
          const adminEmail = process.env.ADMIN_EMAIL || 'softhooky@163.com';
          await transporter.sendMail({
            from: process.env.SMTP_FROM || `"SoftHooky" <${process.env.SMTP_USER || 'softhooky@163.com'}>`,
            to: user.email,
            bcc: adminEmail,
            subject: '恭喜您成为 Softhooky 代理！',
            html: `
              <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 500px; margin: 0 auto;">
                <div style="text-align: center; margin-bottom: 20px;">
                  <div style="width: 60px; height: 60px; background: linear-gradient(135deg, #6366F1, #8B5CF6); border-radius: 16px; display: flex; align-items: center; justify-content: center; margin: 0 auto 15px;">
                    <span style="font-size: 28px;">🛡</span>
                  </div>
                  <h1 style="color: #333; margin: 0; font-size: 22px;">恭喜成为代理！</h1>
                </div>
                <div style="background: #f8f9fa; padding: 20px; border-radius: 12px; margin-bottom: 20px;">
                  <p style="margin: 0 0 10px; color: #333; font-size: 15px;">亲爱的 ${user.email}：</p>
                  <p style="margin: 0 0 15px; color: #666; font-size: 14px; line-height: 1.6;">
                    您已成功通过代理审核，正式成为 <strong>Softhooky</strong> 的代理！
                  </p>
                  <div style="background: #EEF2FF; border-radius: 10px; padding: 15px; margin: 15px 0;">
                    <p style="margin: 0 0 8px; color: #4F46E5; font-weight: bold; font-size: 14px;">📌 下一步操作</p>
                    <p style="margin: 0; color: #666; font-size: 13px; line-height: 1.5;">
                      1. 登录后点击左侧「佣金中心」进入代理后台<br/>
                      2. 在「定价管理」中设置你的售价<br/>
                      3. 在「邀请码」中生成推广链接<br/>
                      4. 分享链接给客户，赚取佣金！
                    </p>
                  </div>
                  <p style="margin: 0; color: #666; font-size: 13px; line-height: 1.6;">
                    客户通过你的链接注册并消费后，你将获得 <strong>佣金分成</strong>。邀请越多，赚得越多！
                  </p>
                </div>
                <div style="text-align: center; color: #999; font-size: 12px;">
                  <p style="margin: 0;">Softhooky - 智能设计平台</p>
                </div>
              </div>
            `
          });
          console.log('📧 代理开通通知邮件已发送至:', user.email);
        } catch (err) {
          console.error('📧 发送代理开通通知邮件失败:', err);
        }
        res.json({ success: true, message: '代理资格已开启，已通知用户' });
      } else {
        await pool.execute('UPDATE users SET is_agent = 0 WHERE id = ?', [id]);
        res.json({ success: true, message: '代理资格已关闭' });
      }
    } catch (error: any) {
      console.error('操作代理失败:', error);
      res.status(500).json({ success: false, message: '操作失败' });
    }
  });

  // 提现管理列表
  app.get("/api/admin/withdraws", adminMiddleware, async (req: any, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const result = await withdrawDb.getPending(page);
      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error('获取提现列表失败:', error);
      res.status(500).json({ success: false, message: '获取提现列表失败' });
    }
  });

  // 审核提现
  app.post("/api/admin/withdraws/:id/process", adminMiddleware, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const { status, remark } = req.body;
      if (!['done', 'rejected'].includes(status)) {
        return res.status(400).json({ success: false, message: '状态必须是 done 或 rejected' });
      }
      // 如果拒绝，需要退款
      if (status === 'rejected') {
        const [requests] = await pool.execute('SELECT * FROM withdraw_requests WHERE id = ?', [id]);
        const reqRecord = (requests as any[])[0];
        if (reqRecord) {
          await pool.execute(
            'UPDATE users SET commission_balance = commission_balance + ? WHERE id = ?',
            [reqRecord.amount, reqRecord.agent_id]
          );
        }
      }
      await withdrawDb.updateStatus(id, status, remark);
      res.json({ success: true, message: '处理完成' });
    } catch (error: any) {
      console.error('处理提现失败:', error);
      res.status(500).json({ success: false, message: '处理失败' });
    }
  });

  // 上传转账凭证
  app.post("/api/admin/withdraws/:id/upload-proof", adminMiddleware, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const { imageBase64 } = req.body;
      if (!imageBase64) {
        return res.status(400).json({ success: false, message: '请提供图片数据' });
      }
      // 解码 base64
      const matches = imageBase64.match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/);
      if (!matches) {
        return res.status(400).json({ success: false, message: '图片格式不正确' });
      }
      const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
      const buffer = Buffer.from(matches[2], 'base64');
      // 上传到 COS
      const url = await uploadToCosWithRetry(buffer, ext);
      // 更新数据库
      await withdrawDb.updateProof(id, url);
      res.json({ success: true, url, message: '凭证上传成功' });
    } catch (error: any) {
      console.error('上传凭证失败:', error);
      res.status(500).json({ success: false, message: '上传失败' });
    }
  });

  // 删除转账凭证
  app.post("/api/admin/withdraws/:id/delete-proof", adminMiddleware, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      await pool.execute('UPDATE withdraw_requests SET proof_image_url = NULL WHERE id = ?', [id]);
      res.json({ success: true, message: '凭证已删除' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: '删除失败' });
    }
  });

  // ==================== 用户领券 API ====================

  // 领取优惠券
  app.post("/api/coupons/claim", authMiddleware, async (req: any, res) => {
    try {
      const { code } = req.body;
      const userId = req.user.id;

      if (!code) {
        return res.status(400).json({ success: false, message: '请输入优惠券码' });
      }

      // 查找优惠券
      const [couponRows] = await pool.execute(
        'SELECT * FROM coupons WHERE code = ?',
        [code.toUpperCase()]
      );
      const coupon = (couponRows as any[])[0];
      if (!coupon) {
        return res.status(404).json({ success: false, message: '优惠券码无效' });
      }
      if (!coupon.is_active) {
        return res.status(400).json({ success: false, message: '该优惠券已失效' });
      }

      // 校验领取截止时间
      if (new Date(coupon.claim_deadline) < new Date()) {
        return res.status(400).json({ success: false, message: '该优惠券已超过领取截止时间' });
      }

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        // 行锁校验名额
        const [lockedRows] = await connection.execute(
          'SELECT claimed_count, max_claims FROM coupons WHERE id = ? FOR UPDATE',
          [coupon.id]
        );
        const locked = (lockedRows as any[])[0];
        if (locked.max_claims > 0 && locked.claimed_count >= locked.max_claims) {
          await connection.rollback();
          return res.status(400).json({ success: false, message: '该优惠券已领完' });
        }

        // 校验重复领取
        const [existingClaims] = await connection.execute(
          'SELECT id FROM coupon_claims WHERE coupon_id = ? AND user_id = ?',
          [coupon.id, userId]
        );
        if ((existingClaims as any[]).length > 0) {
          await connection.rollback();
          return res.status(400).json({ success: false, message: '您已领取过该优惠券' });
        }

        // 计算过期时间
        const expiresAt = new Date(Date.now() + coupon.expire_days * 24 * 60 * 60 * 1000);

        // 原子操作：插入领取记录 + 增加积分 + 更新名额 + 创建积分桶
        const [claimResult] = await connection.execute(
          'INSERT INTO coupon_claims (coupon_id, user_id, credits, expires_at) VALUES (?, ?, ?, ?)',
          [coupon.id, userId, coupon.credits, expiresAt]
        );
        await connection.execute(
          'UPDATE users SET credits = credits + ? WHERE id = ?',
          [coupon.credits, userId]
        );
        await connection.execute(
          'UPDATE coupons SET claimed_count = claimed_count + 1 WHERE id = ?',
          [coupon.id]
        );
        await connection.execute(
          'INSERT INTO credit_buckets (user_id, total_amount, remaining_amount, source, coupon_claim_id, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
          [userId, coupon.credits, coupon.credits, 'coupon', (claimResult as any).insertId, expiresAt]
        );

        await connection.commit();

        // 记录交易
        await pool.execute(
          'INSERT INTO credit_transactions (user_id, amount, type, description) VALUES (?, ?, ?, ?)',
          [userId, coupon.credits, 'coupon', `优惠券领取: ${coupon.code}`]
        );

        res.json({
          success: true,
          message: `领取成功！获得 ${coupon.credits} 积分`,
          credits: coupon.credits,
          expires_at: expiresAt.toISOString(),
          expire_days: coupon.expire_days
        });
      } catch (err) {
        await connection.rollback();
        throw err;
      } finally {
        connection.release();
      }
    } catch (error: any) {
      console.error('领取优惠券失败:', error);
      res.status(500).json({ success: false, message: '领取失败，请稍后重试' });
    }
  });

  // 用户的领取记录
  app.get("/api/coupons/claims", authMiddleware, async (req: any, res) => {
    try {
      const [rows] = await pool.execute(
        `SELECT cc.*, c.code, c.expire_days
         FROM coupon_claims cc
         JOIN coupons c ON cc.coupon_id = c.id
         WHERE cc.user_id = ?
         ORDER BY cc.claimed_at DESC`,
        [req.user.id]
      );
      res.json({ success: true, data: rows });
    } catch (error: any) {
      console.error('获取领取记录失败:', error);
      res.status(500).json({ success: false, message: '获取失败' });
    }
  });

  // 画布状态保存/读取
  app.post("/api/canvas/state", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { stateData } = req.body;
      const stateJson = JSON.stringify(stateData);

      try {
        await pool.execute(`CREATE TABLE IF NOT EXISTS canvas_states (
          id INT PRIMARY KEY AUTO_INCREMENT,
          user_id INT NOT NULL UNIQUE,
          state_data JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
      } catch {}

      const [existing] = await pool.execute('SELECT id FROM canvas_states WHERE user_id = ?', [userId]);
      if (Array.isArray(existing) && existing.length > 0) {
        await pool.execute('UPDATE canvas_states SET state_data = ?, updated_at = NOW() WHERE user_id = ?', [stateJson, userId]);
      } else {
        await pool.execute('INSERT INTO canvas_states (user_id, state_data, created_at, updated_at) VALUES (?, ?, NOW(), NOW())', [userId, stateJson]);
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error('Save canvas state error:', error);
      res.json({ success: true });
    }
  });

  app.get("/api/canvas/state", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user.id;

      try {
        await pool.execute(`CREATE TABLE IF NOT EXISTS canvas_states (
          id INT PRIMARY KEY AUTO_INCREMENT,
          user_id INT NOT NULL UNIQUE,
          state_data JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
      } catch {}

      const [rows] = await pool.execute('SELECT state_data FROM canvas_states WHERE user_id = ?', [userId]);
      if (Array.isArray(rows) && rows.length > 0) {
        const stateData = typeof rows[0].state_data === 'string' ? JSON.parse(rows[0].state_data) : rows[0].state_data;
        res.json({ success: true, data: stateData });
      } else {
        res.json({ success: true, data: null });
      }
    } catch (error: any) {
      console.error('Load canvas state error:', error);
      res.json({ success: true, data: null });
    }
  });

  // 插件画布状态保存/读取（各生图插件独立保存布局等完整状态）
  app.post("/api/canvas/plugin-state", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { pluginId, stateData } = req.body;
      const stateJson = JSON.stringify(stateData);
      try {
        await pool.execute(`CREATE TABLE IF NOT EXISTS canvas_plugin_states (
          id INT PRIMARY KEY AUTO_INCREMENT,
          user_id INT NOT NULL,
          plugin_id VARCHAR(50) NOT NULL,
          state_data JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uk_user_plugin (user_id, plugin_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
      } catch {}
      const [existing] = await pool.execute('SELECT id FROM canvas_plugin_states WHERE user_id = ? AND plugin_id = ?', [userId, pluginId]);
      if (Array.isArray(existing) && existing.length > 0) {
        await pool.execute('UPDATE canvas_plugin_states SET state_data = ?, updated_at = NOW() WHERE user_id = ? AND plugin_id = ?', [stateJson, userId, pluginId]);
      } else {
        await pool.execute('INSERT INTO canvas_plugin_states (user_id, plugin_id, state_data, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())', [userId, pluginId, stateJson]);
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error('Save plugin state error:', error);
      res.json({ success: true });
    }
  });

  app.get("/api/canvas/plugin-state", authMiddleware, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const pluginId = req.query.pluginId as string;
      if (!pluginId) return res.json({ success: true, data: null });
      try {
        await pool.execute(`CREATE TABLE IF NOT EXISTS canvas_plugin_states (
          id INT PRIMARY KEY AUTO_INCREMENT,
          user_id INT NOT NULL,
          plugin_id VARCHAR(50) NOT NULL,
          state_data JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uk_user_plugin (user_id, plugin_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
      } catch {}
      const [rows] = await pool.execute('SELECT state_data FROM canvas_plugin_states WHERE user_id = ? AND plugin_id = ?', [userId, pluginId]);
      if (Array.isArray(rows) && rows.length > 0) {
        const stateData = typeof rows[0].state_data === 'string' ? JSON.parse(rows[0].state_data) : rows[0].state_data;
        res.json({ success: true, data: stateData });
      } else {
        res.json({ success: true, data: null });
      }
    } catch (error: any) {
      console.error('Load plugin state error:', error);
      res.json({ success: true, data: null });
    }
  });

  // 应用版本检测（用于PakePlus等桌面端检测更新）
  app.get("/api/app/version", async (req, res) => {
    res.json({ success: true, version: SERVER_START_TIME, node: process.version });
  });

  // 图片代理：解决COS跨域问题（用于canvas合并长图等场景）
  app.get("/api/images/proxy", async (req, res) => {
    try {
      const imageUrl = req.query.url as string;
      if (!imageUrl) return res.status(400).json({ success: false, error: '缺少url参数' });

      const response = await axios.get(imageUrl, {
        responseType: 'stream',
        timeout: 30000,
      });

      const contentType = response.headers['content-type'] || 'image/png';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      response.data.pipe(res);
    } catch (error: any) {
      console.error('图片代理失败:', error.message);
      res.status(500).json({ success: false, error: '图片代理失败' });
    }
  });

  // ==================== Veo3.1 视频任务持久化 ====================
  // 保存视频任务（提交时记录，轮询时更新状态和URL）
  app.post("/api/video/tasks/save", authMiddleware, async (req: any, res: any) => {
    try {
      const userId = req.user.id;
      const parentUserId = req.user.parentUserId || req.user.id;
      const { taskId, prompt, model, aspectRatio, status, progress, videoUrl } = req.body;
      if (!taskId) return res.status(400).json({ error: 'taskId 必填' });

      // 检查是否已存在
      const [existing] = await pool.execute(
        'SELECT id FROM generated_images WHERE task_id = ? AND user_id = ?',
        [taskId, userId]
      );
      if ((existing as any[]).length > 0) {
        // 更新
        await pool.execute(
          'UPDATE generated_images SET image_url = ?, prompt = ?, model = ?, aspect_ratio = ?, status = ? WHERE task_id = ? AND user_id = ?',
          [videoUrl || null, prompt || null, model || null, aspectRatio || null, status || 'processing', taskId, userId]
        );
      } else {
        // 插入
        const isSubUser = userId !== parentUserId;
        await pool.execute(
          'INSERT INTO generated_images (user_id, parent_user_id, image_url, prompt, model, aspect_ratio, type, task_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [userId, isSubUser ? parentUserId : null, videoUrl || null, prompt || null, model || null, aspectRatio || null, 'video', taskId, status || 'processing']
        );
      }
      res.json({ success: true });
    } catch (err: any) {
      console.error('❌ 保存视频任务失败:', err.message);
      res.status(500).json({ error: '保存失败' });
    }
  });

  // 创意生图专用：获取带 [chatgen] 标记的图片
  app.get("/api/chat/images", authMiddleware, async (req: any, res: any) => {
    try {
      const userId = req.user.id;
      console.log('[chat/images] Loading images for user:', userId);
      const [rows] = await pool.execute(
        `SELECT image_url, prompt, model, aspect_ratio, created_at, type FROM generated_images
         WHERE user_id = ? AND type = 'chatgen' AND (expires_at IS NULL OR expires_at > NOW())
         ORDER BY created_at DESC LIMIT 200`,
        [userId]
      );
      console.log('[chat/images] Found', (rows as any[]).length, 'images');
      if ((rows as any[]).length > 0) {
        console.log('[chat/images] First image:', JSON.stringify((rows as any[])[0]));
      }
      res.json({ success: true, data: rows });
    } catch (err: any) {
      console.error('❌ 获取创意生图失败:', err.message);
      res.json({ success: false, data: [] });
    }
  });

  // 获取用户的视频任务列表
  app.get("/api/video/tasks", authMiddleware, async (req: any, res: any) => {
    try {
      const userId = req.user.id;
      const [rows] = await pool.execute(
        `SELECT * FROM generated_images WHERE user_id = ? AND type = 'video' ORDER BY created_at DESC LIMIT 50`,
        [userId]
      );
      res.json({ success: true, data: rows });
    } catch (err: any) {
      console.error('❌ 加载视频任务失败:', err.message);
      res.status(500).json({ error: '加载失败' });
    }
  });

  // ==================== Veo3.1 视频生成 API ====================
  app.post("/api/video/seedance", authMiddleware, async (req: any, res: any) => {
    const { prompt, model, aspectRatio, resolution, size, images, quantity, seconds, imgMode, duration, seed } = req.body;
    const userId = req.user.id;
    const parentUserId = req.user.parentUserId || req.user.id;
    const subUserId = req.user.isSubUser ? userId : undefined;
    const genCount = Math.min(Math.max(parseInt(quantity) || 1, 1), 4);

    try {
      const isFast = model?.includes('fast');
      const pricingKey = isFast
        ? (resolution === '4k' ? 'veo31_video_fast_4k' : 'veo31_video_fast')
        : (resolution === '4k' ? 'veo31_video_4k' : 'veo31_video');
      const defaultPrice = isFast ? (resolution === '4k' ? 2 : 1) : (resolution === '4k' ? 2 : 1);
      const COST = await getUserEffectivePricing(parentUserId, pricingKey).catch(() => defaultPrice) || defaultPrice;
      const totalCost = COST * genCount;

      const mainUser = await userDb.findById(parentUserId);
      if (!mainUser || mainUser.credits < totalCost) {
        return res.status(400).json({ error: `积分不足，需要 ${totalCost} 积分，当前 ${mainUser?.credits || 0} 积分` });
      }

      const VEO_API_KEY = process.env.VEO_API_KEY || 'sk-r5Clizar6aV39YsxLbHR3rW209LqmnYa5fLT1iePRBtfZT47';
      let taskIds: string[] = [];

      if (images && Array.isArray(images) && images.length > 0 && images.some(Boolean)) {
        // 图生视频：使用 FormData
        const formData = new FormData();
        formData.append('model', model || 'veo-3.1-generate-preview');
        formData.append('prompt', prompt || '');
        formData.append('seconds', String(seconds || duration || 8));
        formData.append('size', size || '1280x720');

        // base64 图片转 buffer 附加到 form
        for (const img of images) {
          if (img) {
            const base64Data = img.replace(/^data:image\/\w+;base64,/, '');
            const buffer = Buffer.from(base64Data, 'base64');
            formData.append('input_reference', buffer, { filename: 'reference.jpg', contentType: 'image/jpeg' });
          }
        }

        if (imgMode === 'first_last') {
          // 首尾帧模式会在前端传两个图，第二个作为 last_frame
          if (images.length >= 2 && images[1]) {
            const base64Data = images[1].replace(/^data:image\/\w+;base64,/, '');
            const buffer = Buffer.from(base64Data, 'base64');
            formData.append('last_frame', buffer, { filename: 'last_frame.jpg', contentType: 'image/jpeg' });
          }
        }

        console.log('🎬 Veo3.1 image-to-video request:', { userId, model, size, seconds, promptLength: prompt?.length });

        const resp = await axios.post('https://api.xgapi.top/v1/videos', formData, {
          headers: { Authorization: 'Bearer ' + VEO_API_KEY, ...formData.getHeaders() },
          timeout: 120000,
          maxBodyLength: Infinity,
        });

        const submitData = resp.data?.data || resp.data;
        const taskId = submitData?.id || resp.data?.id || submitData?.task_id || resp.data?.task_id || submitData?.taskId || resp.data?.taskId;
        if (taskId) taskIds.push(taskId);
      } else {
        // 文生视频：JSON
        const payload: any = {
          model: model || 'veo-3.1-generate-preview',
          prompt: prompt || '',
          duration: seconds || duration || 8,
          size: size || '1280x720',
        };
        // 可选 metadata
        const metadata: any = {};
        if (aspectRatio) metadata.aspectRatio = aspectRatio;
        if (resolution) metadata.resolution = resolution;
        metadata.negativePrompt = 'blurry, watermark, distorted, low quality';
        if (seed) metadata.seed = seed;
        payload.metadata = metadata;

        console.log('🎬 Veo3.1 text-to-video request:', { userId, model, size, duration, promptLength: prompt?.length });

        const resp = await axios.post('https://api.xgapi.top/v1/videos', payload, {
          headers: { Authorization: 'Bearer ' + VEO_API_KEY, 'Content-Type': 'application/json' },
          timeout: 120000,
        });

        const submitData = resp.data?.data || resp.data;
        const taskId = submitData?.id || resp.data?.id || submitData?.task_id || resp.data?.task_id || submitData?.taskId || resp.data?.taskId;
        if (taskId) taskIds.push(taskId);
      }

      if (taskIds.length === 0) {
        throw new Error('视频生成API返回异常，未能获取任务ID');
      }

      // 扣费
      await creditTransactionDb.deduct(parentUserId, totalCost, 'video', `Veo3.1视频生成${genCount}个`, parentUserId, subUserId);

      const updatedUser = await userDb.findById(parentUserId);
      res.json({ success: true, taskIds, remainingCredits: updatedUser?.credits || 0 });
    } catch (err: any) {
      console.error('❌ Veo3.1 video generation error:', err.message, err.response?.data);
      const xgError = err.response?.data;
      const errorMsg = xgError?.error?.message || (typeof xgError?.error === 'string' ? xgError.error : '') || err.message || '视频生成失败';
      res.status(500).json({ error: errorMsg });
    }
  });

  // Veo3.1 视频状态轮询
  app.get("/api/video/seedance/status/:taskId", authMiddleware, async (req: any, res: any) => {
    const { taskId } = req.params;
    try {
      const VEO_API_KEY = process.env.VEO_API_KEY || 'sk-r5Clizar6aV39YsxLbHR3rW209LqmnYa5fLT1iePRBtfZT47';
      // 优先使用 video/generations 查询（带结果地址）
      let resp;
      try {
        resp = await axios.get(`https://api.xgapi.top/v1/video/generations/${taskId}`, {
          headers: { Authorization: 'Bearer ' + VEO_API_KEY },
          timeout: 30000,
        });
      } catch {
        // 降级为 /v1/videos/{taskId}
        resp = await axios.get(`https://api.xgapi.top/v1/videos/${taskId}`, {
          headers: { Authorization: 'Bearer ' + VEO_API_KEY },
          timeout: 30000,
        });
      }

      const data = resp.data;
      // 兼容不同 API 版本的字段名
      const inner = data.data || data;
      res.json({
        status: inner.status || data.status || 'processing',
        progress: inner.progress || inner.progress_percent || inner.percentage || data.progress || 0,
        url: inner.url || inner.video_url || inner.result_url || data.url || inner.output?.url || inner.output?.[0]?.url || data.result?.url || '',
        error: inner.error || data.error || undefined,
      });
    } catch (err: any) {
      console.error('❌ Veo3.1 status poll error:', err.message);
      res.json({ status: 'failed', progress: 0, error: err.message || '查询状态失败' });
    }
  });

  // ==================== 图片元素切割与PSD生成 ====================
  // 将图片中的独立元素（文字、图形等）分割提取，用于生成PSD分层文件
  app.post("/api/images/split-to-psd", authMiddleware, async (req: any, res: any) => {
    try {
      const { imageUrl, topN = 40 } = req.body;
      if (!imageUrl) {
        return res.status(400).json({ success: false, message: '缺少图片URL' });
      }

      console.log('✂️ 开始切割图片元素:', imageUrl.substring(0, 80));

      // 下载原图
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 60000,
        headers: { 'User-Agent': 'Softhooky/1.0' },
      });
      const buffer = Buffer.from(response.data);

      // 执行元素分割
      const result = await splitImageElements(buffer, topN);

      console.log(`✅ 图片切割完成: 共 ${result.elements.length} 个元素`);

      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('❌ 图片元素切割失败:', error.message);
      res.status(500).json({
        success: false,
        message: error.message || '图片元素切割失败',
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const path = await import('path');
    const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'upload');
    console.log('📁 Upload directory:', uploadDir);
    app.use("/upload", express.static(uploadDir));
    app.use(compression());
    app.use(express.static("dist", {
      maxAge: '1y',
      immutable: true,
      setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
      },
    }));
    app.get("*", (req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile("dist/index.html", { root: "." });
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);

    // 异步启动后台任务（不阻塞服务器启动）
    setTimeout(async () => {
      startCleanupScheduler();
      try {
        await pool.execute(
          "ALTER TABLE users ADD COLUMN recharge_disabled TINYINT(1) DEFAULT 0 AFTER is_enabled"
        );
        console.log('✅ 数据库迁移: recharge_disabled 列已添加');
      } catch (err: any) {
        if (err.message?.includes('Duplicate column')) {
          console.log('ℹ️ 数据库迁移: recharge_disabled 列已存在，跳过');
        } else {
          console.error('❌ 数据库迁移失败:', err.message);
        }
      }
    }, 100);

    console.log(`📝 Available routes:`);
    console.log(`   POST /api/auth/register - 用户注册`);
    console.log(`   POST /api/auth/login - 用户登录`);
    console.log(`   GET  /api/auth/me - 获取当前用户`);
    console.log(`   POST /api/auth/logout - 退出登录`);
    console.log(`   POST /api/images/generations - 图片生成`);
    console.log(`   POST /api/chat/deepseek - DeepSeek 对话`);
    console.log(`   POST /api/images/upload-to-cos - 上传图片到 COS`);
    console.log(`   POST /api/images/batch-upload-to-cos - 批量上传图片到 COS`);
  }).on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`⚠️  端口 ${PORT} 被占用，尝试端口 ${PORT + 1}...`);
      PORT++;
      if (PORT > 3010) {
        console.error('❌ 无法找到可用端口 (3000-3010 都被占用)');
        process.exit(1);
      }
      // 重试
      setTimeout(() => {
        app.listen(PORT, "0.0.0.0", () => {
          console.log(`✅ Server running on http://localhost:${PORT}`);
          console.log(`📝 Available routes:`);
          console.log(`   POST /api/auth/register - 用户注册`);
          console.log(`   POST /api/auth/login - 用户登录`);
          console.log(`   GET  /api/auth/me - 获取当前用户`);
          console.log(`   POST /api/auth/logout - 退出登录`);
        });
      }, 100);
    } else {
      console.error('❌ Server error:', err);
      process.exit(1);
    }
  });
}

startServer().catch((err) => {
  console.error('❌ 启动服务器失败:', err);
  process.exit(1);
});
