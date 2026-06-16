import mysql from 'mysql2/promise';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

// 创建数据库连接池
export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 30,
  queueLimit: 50,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  maxIdle: 5,
  idleTimeout: 60000,
  connectTimeout: 60000 // 增加到60秒
});

// 测试连接并处理错误，带重试机制（不阻止服务器启动）
async function testConnection(retries = 5) {
  console.log(`🔄 正在测试数据库连接 (${process.env.DB_HOST})...`);
  
  for (let i = 1; i <= retries; i++) {
    try {
      const connection = await pool.getConnection();
      console.log('✅ 数据库连接成功');
      connection.release();
      return true;
    } catch (err: any) {
      const errorMsg = err.message || err.code || String(err);
      console.error(`❌ 数据库连接失败 (尝试 ${i}/${retries}): ${errorMsg}`);
      
      if (i < retries) {
        const delay = Math.min(10000, i * 2000); // 指数退避：2秒、4秒、6秒、8秒、10秒
        console.log(`⏳ 等待${delay}ms后重试...`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        console.error('❌ 数据库连接失败，已重试5次。');
        console.error('📋 请检查以下事项：');
        console.error('   1. Hostinger 数据库服务是否正在运行');
        console.error('   2. 数据库凭证是否正确 (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME)');
        console.error('   3. 您的 IP 地址是否在 Hostinger 白名单中');
        console.error('   4. 网络连接是否正常');
        console.error('⚠️  服务器将继续运行，但数据库功能不可用');
        return false;
      }
    }
  }
  return false;
}

// 在后台测试连接，不阻止服务器启动
let dbConnected = false;
testConnection().then((result) => {
  dbConnected = result;
}).catch((err) => {
  console.error('❌ 数据库连接测试异常:', err.message);
  dbConnected = false;
});

// 导出数据库连接状态
export function isDbConnected(): boolean {
  return dbConnected;
}

// 添加连接池错误处理
(pool as any).on('error', (err: any) => {
  console.error('❌ 连接池错误:', err.message);
});

// 监控连接池状态
setInterval(() => {
  const poolInfo = (pool as any).pool;
  if (poolInfo) {
    console.log('📊 数据库连接池状态:', {
      总连接数: poolInfo._allConnections?.length || 0,
      空闲连接: poolInfo._freeConnections?.length || 0,
      使用中连接: poolInfo._acquiringConnections?.length || 0
    });
  }
}, 60000); // 每60秒输出一次

// 优雅关闭连接池
process.on('SIGINT', async () => {
  console.log('正在关闭数据库连接池...');
  await pool.end();
  console.log('数据库连接池已关闭');
  process.exit(0);
});

// 密码哈希函数
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  // 仅支持 bcrypt 哈希，移除不安全的 SHA256 回退
  if (hash.startsWith('$2a$') || hash.startsWith('$2b$')) {
    return bcrypt.compare(password, hash);
  }
  // 旧的 SHA256 哈希不被支持，需要重新设置密码
  console.error('检测到不安全的密码哈希格式，请联系管理员重新设置密码');
  return false;
}

// 生成随机 token
export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// 生成邀请码
export function generateInviteCode(): string {
  return crypto.randomBytes(6).toString('hex').toUpperCase();
}

// 安全执行数据库查询的辅助函数
export async function safeQuery<T = any>(
  queryFn: (connection: mysql.PoolConnection) => Promise<T>,
  retries: number = 3
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    let connection: mysql.PoolConnection | null = null;
    
    try {
      connection = await pool.getConnection();
      const result = await queryFn(connection);
      connection.release();
      return result;
    } catch (error: any) {
      lastError = error;
      
      if (connection) {
        try {
          connection.release();
        } catch (releaseError) {
          console.error('释放连接失败:', releaseError);
        }
      }
      
      console.error(`数据库查询失败 (尝试 ${attempt}/${retries}):`, error.message);
      
      // 如果是连接错误，等待后重试
      if (attempt < retries && (
        error.message.includes('closed state') ||
        error.message.includes('Connection lost') ||
        error.code === 'PROTOCOL_CONNECTION_LOST'
      )) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        continue;
      }
      
      throw error;
    }
  }
  
  throw lastError;
}

// 数据库操作重试包装器
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: any;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      // 如果是连接错误，重试
      if (error.code === 'ECONNRESET' || error.code === 'PROTOCOL_CONNECTION_LOST' || error.code === 'ETIMEDOUT') {
        console.log(`⚠️ 数据库连接错误，第 ${i + 1}/${maxRetries} 次重试...`);
        
        if (i < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
          continue;
        }
      }
      
      // 其他错误直接抛出
      throw error;
    }
  }
  
  throw lastError;
}

// 用户数据库操作
export const userDb = {
  async findByEmail(email: string) {
    return withRetry(async () => {
      const [rows] = await pool.execute(
        'SELECT * FROM users WHERE email = ?',
        [email]
      );
      return (rows as any[])[0];
    });
  },

  async findById(id: number) {
    return withRetry(async () => {
      const [rows] = await pool.execute(
        'SELECT * FROM users WHERE id = ?',
        [id]
      );
      return (rows as any[])[0];
    });
  },

  async create(email: string, passwordHash: string, apiKey?: string) {
    return withRetry(async () => {
      const [result] = await pool.execute(
        'INSERT INTO users (email, password_hash, credits, api_key) VALUES (?, ?, 0, ?)',
        [email, passwordHash, apiKey || null]
      );
      return (result as any).insertId;
    });
  },

  async updateLastLogin(userId: number) {
    return withRetry(async () => {
      await pool.execute(
        'UPDATE users SET last_login_at = NOW() WHERE id = ?',
        [userId]
      );
    });
  },

  async updateCredits(userId: number, credits: number) {
    return withRetry(async () => {
      await pool.execute(
        'UPDATE users SET credits = ? WHERE id = ?',
        [credits, userId]
      );
    });
  },

  async updateApiKey(email: string, apiKey: string) {
    return withRetry(async () => {
      await pool.execute(
        'UPDATE users SET api_key = ? WHERE email = ?',
        [apiKey, email]
      );
    });
  },

  // ====== 代理相关方法 ======

  async updateCommissionBalance(userId: number, amount: number) {
    return withRetry(async () => {
      await pool.execute(
        'UPDATE users SET commission_balance = commission_balance + ? WHERE id = ?',
        [amount, userId]
      );
    });
  },

  async findByInviteCode(code: string) {
    return withRetry(async () => {
      const [rows] = await pool.execute(
        `SELECT u.* FROM users u
         INNER JOIN invite_codes ic ON u.id = ic.parent_user_id
         WHERE ic.code = ? AND ic.expires_at > NOW() AND ic.used_at IS NULL
         LIMIT 1`,
        [code]
      );
      return (rows as any[])[0];
    });
  },

  async findAgentCustomers(agentId: number, page: number = 1, pageSize: number = 20) {
    return withRetry(async () => {
      const offset = (page - 1) * pageSize;
      const [rows] = await pool.execute(
        `SELECT id, email, credits, created_at, last_login_at,
         (SELECT COALESCE(SUM(ABS(amount)), 0) FROM credit_transactions WHERE user_id = users.id AND amount < 0) as total_consumption
         FROM users WHERE invited_by = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [agentId, pageSize, offset]
      );
      const [countResult] = await pool.execute(
        'SELECT COUNT(*) as total FROM users WHERE invited_by = ?',
        [agentId]
      );
      return {
        customers: rows,
        total: (countResult as any[])[0]?.total || 0,
        page,
        pageSize
      };
    });
  },

  async getAllAgents(page: number = 1, pageSize: number = 20) {
    return withRetry(async () => {
      const offset = (page - 1) * pageSize;
      const [rows] = await pool.execute(
        `SELECT u.id, u.email, u.credits, u.commission_balance, u.is_agent, u.is_enabled, u.created_at,
         (SELECT COUNT(*) FROM users WHERE invited_by = u.id) as customer_count,
         (SELECT COALESCE(SUM(amount), 0) FROM commission_logs WHERE agent_id = u.id) as total_commission
         FROM users u WHERE u.is_agent = 1 ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
        [pageSize, offset]
      );
      const [countResult] = await pool.execute(
        'SELECT COUNT(*) as total FROM users WHERE is_agent = 1'
      );
      return {
        agents: rows,
        total: (countResult as any[])[0]?.total || 0,
        page,
        pageSize
      };
    });
  }
};

// ==================== 工作流数据库操作 ====================
export const workflowDb = {
  async initTable() {
    await pool.execute(`CREATE TABLE IF NOT EXISTS workflows (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      name VARCHAR(255) NOT NULL DEFAULT '',
      nodes_json LONGTEXT NOT NULL,
      connections_json LONGTEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  },

  async getByUserId(userId: number) {
    await this.initTable();
    const [rows] = await pool.execute(
      'SELECT id, user_id, name, nodes_json, connections_json, created_at, updated_at FROM workflows WHERE user_id = ? ORDER BY updated_at DESC',
      [userId]
    );
    return rows as any[];
  },

  async getById(id: number, userId: number) {
    await this.initTable();
    const [rows] = await pool.execute(
      'SELECT id, user_id, name, nodes_json, connections_json, created_at, updated_at FROM workflows WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    return (rows as any[])[0] || null;
  },

  async create(userId: number, name: string, nodesJson: string, connectionsJson: string) {
    await this.initTable();
    const [result] = await pool.execute(
      'INSERT INTO workflows (user_id, name, nodes_json, connections_json) VALUES (?, ?, ?, ?)',
      [userId, name, nodesJson, connectionsJson]
    );
    return (result as any).insertId;
  },

  async update(id: number, userId: number, name: string, nodesJson: string, connectionsJson: string) {
    await this.initTable();
    await pool.execute(
      'UPDATE workflows SET name = ?, nodes_json = ?, connections_json = ?, updated_at = NOW() WHERE id = ? AND user_id = ?',
      [name, nodesJson, connectionsJson, id, userId]
    );
  },

  async delete(id: number, userId: number) {
    await this.initTable();
    await pool.execute(
      'DELETE FROM workflows WHERE id = ? AND user_id = ?',
      [id, userId]
    );
  }
};

// ==================== 代理定价数据库操作 ====================
export const agentDb = {
  async setPricing(agentId: number, pricing: Record<string, number>) {
    return withRetry(async () => {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        // 清空旧定价
        await connection.execute(
          'DELETE FROM agent_pricing WHERE agent_id = ?',
          [agentId]
        );
        // 批量插入新定价
        for (const [key, price] of Object.entries(pricing)) {
          if (price != null && price > 0) {
            await connection.execute(
              'INSERT INTO agent_pricing (agent_id, service_key, price) VALUES (?, ?, ?)',
              [agentId, key, price]
            );
          }
        }
        await connection.commit();
      } catch (err) {
        await connection.rollback();
        throw err;
      } finally {
        connection.release();
      }
    });
  },

  async getPricing(agentId: number): Promise<Record<string, number>> {
    return withRetry(async () => {
      const [rows] = await pool.execute(
        'SELECT service_key, price FROM agent_pricing WHERE agent_id = ?',
        [agentId]
      );
      const result: Record<string, number> = {};
      for (const row of rows as any[]) {
        result[row.service_key] = parseFloat(row.price);
      }
      return result;
    });
  }
};

// ==================== 佣金流水数据库操作 ====================
export const commissionDb = {
  async create(agentId: number, userId: number, amount: number, source: string, orderId?: string) {
    return withRetry(async () => {
      const [result] = await pool.execute(
        'INSERT INTO commission_logs (agent_id, user_id, amount, source, order_id) VALUES (?, ?, ?, ?, ?)',
        [agentId, userId, amount, source, orderId || null]
      );
      return (result as any).insertId;
    });
  },

  async getByAgentId(agentId: number, page: number = 1, pageSize: number = 20) {
    return withRetry(async () => {
      const offset = (page - 1) * pageSize;
      const [rows] = await pool.execute(
        `SELECT cl.*, u.email as user_email
         FROM commission_logs cl
         LEFT JOIN users u ON cl.user_id = u.id
         WHERE cl.agent_id = ?
         ORDER BY cl.created_at DESC LIMIT ? OFFSET ?`,
        [agentId, pageSize, offset]
      );
      const [countResult] = await pool.execute(
        'SELECT COUNT(*) as total FROM commission_logs WHERE agent_id = ?',
        [agentId]
      );
      const [sumResult] = await pool.execute(
        'SELECT COALESCE(SUM(amount), 0) as total FROM commission_logs WHERE agent_id = ?',
        [agentId]
      );
      return {
        logs: rows,
        total: (countResult as any[])[0]?.total || 0,
        totalCommission: parseFloat((sumResult as any[])[0]?.total || '0'),
        page,
        pageSize
      };
    });
  },

  async getTotalCommission(agentId: number): Promise<number> {
    return withRetry(async () => {
      const [rows] = await pool.execute(
        'SELECT COALESCE(SUM(amount), 0) as total FROM commission_logs WHERE agent_id = ?',
        [agentId]
      );
      return parseFloat((rows as any[])[0]?.total || '0');
    });
  },

  async getAllCommissions(page: number = 1, pageSize: number = 20) {
    return withRetry(async () => {
      const offset = (page - 1) * pageSize;
      const [rows] = await pool.execute(
        `SELECT cl.*, u.email as agent_email, cu.email as user_email
         FROM commission_logs cl
         LEFT JOIN users u ON cl.agent_id = u.id
         LEFT JOIN users cu ON cl.user_id = cu.id
         ORDER BY cl.created_at DESC LIMIT ? OFFSET ?`,
        [pageSize, offset]
      );
      const [countResult] = await pool.execute(
        'SELECT COUNT(*) as total FROM commission_logs'
      );
      return {
        logs: rows,
        total: (countResult as any[])[0]?.total || 0,
        page,
        pageSize
      };
    });
  }
};

// ==================== 提现申请数据库操作 ====================
export const withdrawDb = {
  async create(agentId: number, amount: number, accountType?: string, accountId?: string) {
    return withRetry(async () => {
      const [result] = await pool.execute(
        'INSERT INTO withdraw_requests (agent_id, amount, account_type, account_id) VALUES (?, ?, ?, ?)',
        [agentId, amount, accountType || null, accountId || null]
      );
      return (result as any).insertId;
    });
  },

  async updateProof(id: number, imageUrl: string) {
    return withRetry(async () => {
      await pool.execute(
        'UPDATE withdraw_requests SET proof_image_url = ? WHERE id = ?',
        [imageUrl, id]
      );
    });
  },

  async getByAgentId(agentId: number) {
    return withRetry(async () => {
      const [rows] = await pool.execute(
        'SELECT * FROM withdraw_requests WHERE agent_id = ? ORDER BY created_at DESC',
        [agentId]
      );
      return rows;
    });
  },

  async getPending(page: number = 1, pageSize: number = 20) {
    return withRetry(async () => {
      const offset = (page - 1) * pageSize;
      const [rows] = await pool.execute(
        `SELECT wr.*, u.email as agent_email
         FROM withdraw_requests wr
         LEFT JOIN users u ON wr.agent_id = u.id
         ORDER BY FIELD(wr.status, 'pending', 'done', 'rejected'), wr.created_at DESC
         LIMIT ? OFFSET ?`,
        [pageSize, offset]
      );
      const [countResult] = await pool.execute(
        'SELECT COUNT(*) as total FROM withdraw_requests'
      );
      const [pendingCount] = await pool.execute(
        "SELECT COUNT(*) as total FROM withdraw_requests WHERE status = 'pending'"
      );
      return {
        requests: rows,
        total: (countResult as any[])[0]?.total || 0,
        pendingCount: (pendingCount as any[])[0]?.total || 0,
        page,
        pageSize
      };
    });
  },

  async updateStatus(id: number, status: string, remark?: string) {
    return withRetry(async () => {
      await pool.execute(
        'UPDATE withdraw_requests SET status = ?, remark = ?, processed_at = NOW() WHERE id = ?',
        [status, remark || null, id]
      );
    });
  }
};

// 会话数据库操作
export const sessionDb = {
  async create(userId: number, token: string, ipAddress?: string) {
    return withRetry(async () => {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7天后过期
      
      // 登录时清理该用户的过期会话
      await pool.execute(
        'DELETE FROM sessions WHERE user_id = ? AND expires_at <= NOW()',
        [userId]
      );

      await pool.execute(
        'INSERT INTO sessions (user_id, token, expires_at, ip_address) VALUES (?, ?, ?, ?)',
        [userId, token, expiresAt, ipAddress || null]
      );
    });
  },

  async validate(token: string) {
    return withRetry(async () => {
      const [rows] = await pool.execute(
        `SELECT s.*, u.email, u.credits 
         FROM sessions s 
         JOIN users u ON s.user_id = u.id 
         WHERE s.token = ? AND s.expires_at > NOW()`,
        [token]
      );
      return (rows as any[])[0];
    });
  },

  async delete(token: string) {
    return withRetry(async () => {
      await pool.execute(
        'DELETE FROM sessions WHERE token = ?',
        [token]
      );
    });
  },

  async deleteByUserAndIp(userId: number, ipAddress: string) {
    return withRetry(async () => {
      await pool.execute(
        'DELETE FROM sessions WHERE user_id = ? AND ip_address = ?',
        [userId, ipAddress]
      );
    });
  }
};

// 积分桶操作（按到期时间优先消费）
export const creditBucketDb = {
  async add(userId: number, amount: number, source: string, expiresAt: Date | null = null, couponClaimId: number | null = null) {
    await pool.execute(
      'INSERT INTO credit_buckets (user_id, total_amount, remaining_amount, source, coupon_claim_id, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, amount, amount, source, couponClaimId, expiresAt]
    );
  },

  // 清理过期桶并从用户余额中扣除
  async cleanExpired(userId: number) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [users] = await connection.execute(
        'SELECT credits FROM users WHERE id = ? FOR UPDATE',
        [userId]
      );
      const currentCredits = (users as any[])[0]?.credits || 0;

      const [expiredBuckets] = await connection.execute(
        `SELECT id, remaining_amount FROM credit_buckets
         WHERE user_id = ? AND remaining_amount > 0
         AND expires_at IS NOT NULL AND expires_at <= NOW()
         FOR UPDATE`,
        [userId]
      );

      let totalExpired = 0;
      for (const eb of expiredBuckets as any[]) {
        totalExpired += parseFloat(eb.remaining_amount);
        await connection.execute(
          'UPDATE credit_buckets SET remaining_amount = 0 WHERE id = ?',
          [eb.id]
        );
      }

      if (totalExpired > 0) {
        const newCredits = Math.max(0, currentCredits - totalExpired);
        await connection.execute(
          'UPDATE users SET credits = ? WHERE id = ?',
          [newCredits, userId]
        );
        await connection.execute(
          'INSERT INTO credit_transactions (user_id, amount, type, description) VALUES (?, ?, ?, ?)',
          [userId, -totalExpired, 'expired', '优惠券积分过期扣除']
        );
      }

      await connection.commit();
      return totalExpired;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  // 按到期时间优先扣费（Earliest Expiry First）
  async consume(userId: number, amount: number) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 先清理过期桶
      const [users] = await connection.execute(
        'SELECT credits FROM users WHERE id = ? FOR UPDATE',
        [userId]
      );
      let currentCredits = parseFloat((users as any[])[0]?.credits || '0');

      const [expiredBuckets] = await connection.execute(
        `SELECT id, remaining_amount FROM credit_buckets
         WHERE user_id = ? AND remaining_amount > 0
         AND expires_at IS NOT NULL AND expires_at <= NOW()
         FOR UPDATE`,
        [userId]
      );

      let totalExpired = 0;
      for (const eb of expiredBuckets as any[]) {
        totalExpired += parseFloat(eb.remaining_amount);
        await connection.execute(
          'UPDATE credit_buckets SET remaining_amount = 0 WHERE id = ?',
          [eb.id]
        );
      }

      if (totalExpired > 0) {
        currentCredits = Math.max(0, currentCredits - totalExpired);
        await connection.execute(
          'UPDATE users SET credits = ? WHERE id = ?',
          [currentCredits, userId]
        );
      }

      if (currentCredits < amount) {
        await connection.rollback();
        return { success: false, message: '积分不足' };
      }

      // 获取可用桶（未过期且有余量），按到期时间升序排序
      const [buckets] = await connection.execute(
        `SELECT id, remaining_amount FROM credit_buckets
         WHERE user_id = ? AND remaining_amount > 0
         AND (expires_at IS NULL OR expires_at > NOW())
         ORDER BY expires_at ASC
         FOR UPDATE`,
        [userId]
      );

      let bucketRows = buckets as any[];

      // 兼容旧数据：如无桶，为全部余额创建一个永久桶
      if (bucketRows.length === 0 && currentCredits > 0) {
        await connection.execute(
          'INSERT INTO credit_buckets (user_id, total_amount, remaining_amount, source, expires_at) VALUES (?, ?, ?, ?, NULL)',
          [userId, currentCredits, currentCredits, 'recharge']
        );
        const [newBuckets] = await connection.execute(
          `SELECT id, remaining_amount FROM credit_buckets
           WHERE user_id = ? AND remaining_amount > 0
           AND (expires_at IS NULL OR expires_at > NOW())
           ORDER BY expires_at ASC
           FOR UPDATE`,
          [userId]
        );
        bucketRows = newBuckets as any[];
      }

      // 从最早到期的桶开始扣
      let remainingToDeduct = amount;
      for (const bucket of bucketRows) {
        if (remainingToDeduct <= 0) break;

        const bucketRemaining = parseFloat(bucket.remaining_amount);
        const deductFromBucket = Math.min(remainingToDeduct, bucketRemaining);

        await connection.execute(
          'UPDATE credit_buckets SET remaining_amount = remaining_amount - ? WHERE id = ?',
          [deductFromBucket, bucket.id]
        );

        remainingToDeduct -= deductFromBucket;
      }

      // 扣总余额
      await connection.execute(
        'UPDATE users SET credits = credits - ? WHERE id = ?',
        [amount, userId]
      );

      await connection.commit();
      return { success: true, credits: currentCredits - amount };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
};

// 积分交易记录操作
export const creditTransactionDb = {
  async create(userId: number, amount: number, type: string, description: string) {
    await pool.execute(
      'INSERT INTO credit_transactions (user_id, amount, type, description) VALUES (?, ?, ?, ?)',
      [userId, amount, type, description]
    );
  },

  async getByUserId(userId: number) {
    const [rows] = await pool.execute(
      'SELECT * FROM credit_transactions WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    return rows;
  },

  async deduct(userId: number, amount: number, type: string, description: string, parentUserId?: number, subUserId?: number) {
    console.log('💰 deduct called:', { userId, amount, type, description, parentUserId, subUserId });
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 锁定用户行，检查积分和配额模式
      const [users] = await connection.execute(
        'SELECT credits, sub_quota_mode FROM users WHERE id = ? FOR UPDATE',
        [userId]
      );
      const userRow = (users as any[])[0];
      const currentCredits = userRow?.credits || 0;
      const quotaMode = userRow?.sub_quota_mode || 'shared';

      // 配额模式：子账号消费时检查配额
      if (subUserId && quotaMode === 'allocated') {
        // 锁定子账号行检查配额
        const [subUsers] = await connection.execute(
          'SELECT quota_limit, quota_consumed FROM sub_users WHERE id = ? FOR UPDATE',
          [subUserId]
        );
        const subRow = (subUsers as any[])[0];
        if (!subRow) {
          await connection.rollback();
          return { success: false, message: '子账号不存在' };
        }

        const quotaLimit = Number(subRow.quota_limit);
        const quotaConsumed = Number(subRow.quota_consumed);
        const quotaRemaining = quotaLimit - quotaConsumed;

        console.log('💰 配额检查:', { quotaLimit, quotaConsumed, quotaRemaining, deductAmount: amount });

        if (quotaRemaining < amount) {
          await connection.rollback();
          return { success: false, message: `子账号额度不足，剩余 ${Math.max(0, quotaRemaining).toFixed(1)} 积分` };
        }

        // 检查主账号积分
        if (currentCredits < amount) {
          await connection.rollback();
          return { success: false, message: '主账号积分不足' };
        }

        // 扣除主账号积分
        await connection.execute(
          'UPDATE users SET credits = credits - ? WHERE id = ?',
          [amount, userId]
        );

        // 更新子账号配额消耗
        await connection.execute(
          'UPDATE sub_users SET quota_consumed = quota_consumed + ? WHERE id = ?',
          [amount, subUserId]
        );
      } else {
        // 共享模式：按到期时间优先消费（Earliest Expiry First）
        // 1. 清理过期的优惠券桶
        const [expiredBuckets] = await connection.execute(
          `SELECT id, remaining_amount FROM credit_buckets
           WHERE user_id = ? AND remaining_amount > 0
           AND expires_at IS NOT NULL AND expires_at <= NOW()
           FOR UPDATE`,
          [userId]
        );
        let totalExpired = 0;
        for (const eb of expiredBuckets as any[]) {
          totalExpired += parseFloat(eb.remaining_amount);
          await connection.execute(
            'UPDATE credit_buckets SET remaining_amount = 0 WHERE id = ?',
            [eb.id]
          );
        }
        let adjustedCredits = currentCredits;
        if (totalExpired > 0) {
          adjustedCredits = Math.max(0, currentCredits - totalExpired);
          await connection.execute(
            'UPDATE users SET credits = ? WHERE id = ?',
            [adjustedCredits, userId]
          );
        }

        if (adjustedCredits < amount) {
          await connection.rollback();
          return { success: false, message: '积分不足' };
        }

        // 2. 获取可用桶（未过期且有余量），按到期时间升序
        const [buckets] = await connection.execute(
          `SELECT id, remaining_amount FROM credit_buckets
           WHERE user_id = ? AND remaining_amount > 0
           AND (expires_at IS NULL OR expires_at > NOW())
           ORDER BY expires_at ASC
           FOR UPDATE`,
          [userId]
        );
        let bucketRows = buckets as any[];

        // 兼容旧数据：如无桶，为全部余额创建一个永久桶
        if (bucketRows.length === 0 && adjustedCredits > 0) {
          await connection.execute(
            'INSERT INTO credit_buckets (user_id, total_amount, remaining_amount, source, expires_at) VALUES (?, ?, ?, ?, NULL)',
            [userId, adjustedCredits, adjustedCredits, 'recharge']
          );
          const [newBuckets] = await connection.execute(
            `SELECT id, remaining_amount FROM credit_buckets
             WHERE user_id = ? AND remaining_amount > 0
             AND (expires_at IS NULL OR expires_at > NOW())
             ORDER BY expires_at ASC
             FOR UPDATE`,
            [userId]
          );
          bucketRows = newBuckets as any[];
        }

        // 3. 从最早到期的桶开始扣
        let remainingToDeduct = amount;
        for (const bucket of bucketRows) {
          if (remainingToDeduct <= 0) break;
          const bucketRemaining = parseFloat(bucket.remaining_amount);
          const deductFromBucket = Math.min(remainingToDeduct, bucketRemaining);
          await connection.execute(
            'UPDATE credit_buckets SET remaining_amount = remaining_amount - ? WHERE id = ?',
            [deductFromBucket, bucket.id]
          );
          remainingToDeduct -= deductFromBucket;
        }

        // 4. 扣总余额
        await connection.execute(
          'UPDATE users SET credits = credits - ? WHERE id = ?',
          [amount, userId]
        );

        // 共享模式也记录子账号消耗
        if (subUserId) {
          await connection.execute(
            'UPDATE sub_users SET quota_consumed = quota_consumed + ? WHERE id = ?',
            [amount, subUserId]
          );
        }
      }

      // 记录交易
      await connection.execute(
        'INSERT INTO credit_transactions (user_id, parent_user_id, sub_user_id, amount, type, description) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, parentUserId || null, subUserId || null, -amount, type, description]
      );

      await connection.commit();

      // 获取最新积分
      const [updated] = await connection.execute(
        'SELECT credits FROM users WHERE id = ?',
        [userId]
      );

      return { success: true, credits: (updated as any[])[0]?.credits || 0 };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
};

// 生成的图片记录数据库操作
export const generatedImagesDb = {
  async create(userId: number, imageUrl: string, prompt?: string, options?: {
    model?: string;
    aspectRatio?: string;
    resolution?: string;
    type?: 'generated' | 'edited' | 'chatgen' | 'grid' | 'composition' | 'refined' | 'style' | 'detail' | 'fusion' | 'apparel' | 'apparel-3d' | 'video';
    parentUserId?: number;
    gridCount?: number;
    taskId?: string;
  }) {
    return await safeQuery(async (connection) => {
      console.log('🔍 Creating image record:', { userId, imageUrl: imageUrl.substring(0, 100), type: options?.type });
      
      // Check 1: existing image with same URL for this user
      const [existing] = await connection.execute(
        'SELECT id, type FROM generated_images WHERE user_id = ? AND image_url = ?',
        [userId, imageUrl]
      );
      
      if ((existing as any[]).length > 0) {
        const existingId = (existing as any[])[0].id;
        const existingType = (existing as any[])[0].type;
        // 如果已存在但type不同，更新type（特别是chatgen类型）
        if (options?.type && existingType !== options.type) {
          console.log('🔄 Updating image type from', existingType, 'to', options.type, 'for ID:', existingId);
          await connection.execute(
            'UPDATE generated_images SET type = ? WHERE id = ?',
            [options.type, existingId]
          );
        }
        console.log('⚠️ Image already exists for user:', userId, 'Existing ID:', existingId);
        return existingId;
      }
      
      // Check 2: recent image with same prompt from same user (within 30 seconds)
      // This prevents duplicates when R2 generates different URLs for the same image
      if (prompt) {
        const [recentExisting] = await connection.execute(
          `SELECT id, type FROM generated_images 
           WHERE user_id = ? AND prompt = ? AND created_at > DATE_SUB(NOW(), INTERVAL 30 SECOND)`,
          [userId, prompt]
        );
        
        if ((recentExisting as any[]).length > 0) {
          const recentId = (recentExisting as any[])[0].id;
          const recentType = (recentExisting as any[])[0].type;
          // 如果已存在但type不同，更新type
          if (options?.type && recentType !== options.type) {
            console.log('🔄 Updating recent image type from', recentType, 'to', options.type, 'for ID:', recentId);
            await connection.execute(
              'UPDATE generated_images SET type = ? WHERE id = ?',
              [options.type, recentId]
            );
          }
          console.log('⚠️ Recent image with same prompt already exists for user:', userId, 
                      'Existing ID:', recentId,
                      'Created at:', (recentExisting as any[])[0].created_at);
          return recentId;
        }
      }
      
      try {
        const [result] = await connection.execute(
          'INSERT INTO generated_images (user_id, parent_user_id, image_url, prompt, model, aspect_ratio, resolution, type, task_id, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 3 DAY))',
          [
            userId,
            options?.parentUserId || null,
            imageUrl,
            prompt || null,
            options?.model || 'gemini-3.1-flash-image-preview',
            options?.aspectRatio || '智能',
            options?.resolution || '1K',
            options?.type || 'generated',
            options?.taskId || null
          ]
        );
        console.log('✅ Created new image record with ID:', (result as any).insertId);
        return (result as any).insertId;
      } catch (insertErr: any) {
        if (insertErr.message?.includes("Unknown column 'task_id'")) {
          const [result] = await connection.execute(
            'INSERT INTO generated_images (user_id, parent_user_id, image_url, prompt, model, aspect_ratio, resolution, type, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 3 DAY))',
            [
              userId,
              options?.parentUserId || null,
              imageUrl,
              prompt || null,
              options?.model || 'gemini-3.1-flash-image-preview',
              options?.aspectRatio || '智能',
              options?.resolution || '1K',
              options?.type || 'generated',
            ]
          );
          console.log('✅ Created new image record (without task_id) with ID:', (result as any).insertId);
          return (result as any).insertId;
        }
        throw insertErr;
      }
    });
  },

  async getByUserId(userId: number, parentUserId: number, page: number = 1, pageSize: number = 20, filter: string = 'mine') {
    const offset = (page - 1) * pageSize;
    const isSubUser = userId !== parentUserId;

    console.log('🔍 Querying images:', { userId, parentUserId, page, pageSize, filter, isSubUser });

    let whereClause: string;
    let queryParams: any[];

    if (filter === 'sub') {
      whereClause = 'gi.parent_user_id = ? AND gi.parent_user_id IS NOT NULL AND (gi.expires_at IS NULL OR gi.expires_at > NOW())';
      queryParams = [parentUserId];
    } else if (filter === 'all') {
      // 查看所有自己的图片（包括主账号和子账号的）
      whereClause = 'gi.user_id = ? AND (gi.expires_at IS NULL OR gi.expires_at > NOW())';
      queryParams = [userId];
    } else if (isSubUser) {
      // 子账号查看自己的图片
      whereClause = 'gi.user_id = ? AND (gi.expires_at IS NULL OR gi.expires_at > NOW())';
      queryParams = [userId];
    } else {
      whereClause = 'gi.user_id = ? AND gi.parent_user_id IS NULL AND (gi.expires_at IS NULL OR gi.expires_at > NOW())';
      queryParams = [filter === 'mine' ? userId : parentUserId];
    }

    const [rows] = await pool.execute(
      `SELECT gi.*, su.name as sub_user_name FROM generated_images gi
       LEFT JOIN sub_users su ON gi.user_id = su.id AND gi.parent_user_id IS NOT NULL
       WHERE ${whereClause}
       ORDER BY gi.created_at DESC LIMIT ? OFFSET ?`,
      [...queryParams, pageSize, offset]
    );

    const imageRows = rows as any[];
    console.log('🔍 DB Query Result:', imageRows.length, 'images');

    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM generated_images gi WHERE ${whereClause}`,
      queryParams
    );

    return {
      images: imageRows,
      total: (countResult as any[])[0]?.total || 0,
      page,
      pageSize,
      totalPages: Math.ceil(((countResult as any[])[0]?.total || 0) / pageSize)
    };
  },

  async delete(id: number, userId: number, parentUserId?: number) {
    if (parentUserId && parentUserId !== userId) {
      await pool.execute(
        'DELETE FROM generated_images WHERE id = ? AND (user_id = ? OR parent_user_id = ?)',
        [id, userId, parentUserId]
      );
    } else {
      await pool.execute(
        'DELETE FROM generated_images WHERE id = ? AND user_id = ?',
        [id, userId]
      );
    }
  },

  async updateUrlByTaskId(taskId: string, newUrl: string) {
    try {
      const [result] = await pool.execute(
        'UPDATE generated_images SET image_url = ? WHERE task_id = ? AND image_url = ?',
        [newUrl, taskId, '']
      );
      const affectedRows = (result as any).affectedRows;
      console.log(`🔄 updateUrlByTaskId: ${affectedRows} rows affected for taskId: ${taskId}`);
      return affectedRows;
    } catch (err: any) {
      if (err.message?.includes("Unknown column 'task_id'")) {
        console.warn('⚠️ task_id column not found, skipping updateUrlByTaskId');
        return 0;
      }
      throw err;
    }
  },

  async updatePosition(imageUrl: string, userId: number, x: number, y: number) {
    await pool.execute(
      'UPDATE generated_images SET position_x = ?, position_y = ? WHERE image_url = ? AND user_id = ?',
      [x, y, imageUrl, userId]
    );
  },

  async batchUpdatePositions(positions: { imageUrl: string; x: number; y: number }[], userId: number) {
    for (const pos of positions) {
      await pool.execute(
        'UPDATE generated_images SET position_x = ?, position_y = ? WHERE image_url = ? AND user_id = ?',
        [pos.x, pos.y, pos.imageUrl, userId]
      );
    }
  },

  async updateUrlByTempUrl(tempUrl: string, newUrl: string) {
    const [result] = await pool.execute(
      'UPDATE generated_images SET image_url = ? WHERE image_url = ?',
      [newUrl, tempUrl]
    );
    const affectedRows = (result as any).affectedRows;
    console.log(`🔄 updateUrlByTempUrl: ${affectedRows} rows affected (tempUrl: ${tempUrl.substring(0, 50)}...)`);
    if (affectedRows === 0) {
      console.warn(`⚠️ No rows updated for tempUrl: ${tempUrl.substring(0, 50)}...`);
    }
    return affectedRows;
  }
};


// 子账号数据库操作
export const subUserDb = {
  async create(parentUserId: number, email: string, passwordHash: string, name: string) {
    return withRetry(async () => {
      const [result] = await pool.execute(
        'INSERT INTO sub_users (parent_user_id, email, password_hash, name, is_enabled) VALUES (?, ?, ?, ?, 1)',
        [parentUserId, email, passwordHash, name]
      );
      return (result as any).insertId;
    });
  },

  async findByEmail(email: string) {
    return withRetry(async () => {
      const [rows] = await pool.execute(
        'SELECT * FROM sub_users WHERE email = ?',
        [email]
      );
      return (rows as any[])[0];
    });
  },

  async findById(id: number) {
    return withRetry(async () => {
      const [rows] = await pool.execute(
        'SELECT * FROM sub_users WHERE id = ?',
        [id]
      );
      return (rows as any[])[0];
    });
  },

  async updateQuota(subUserId: number, quotaLimit: number) {
    return withRetry(async () => {
      await pool.execute(
        'UPDATE sub_users SET quota_limit = ?, quota_consumed = 0 WHERE id = ?',
        [quotaLimit, subUserId]
      );
    });
  },

  async getTotalAllocatedQuota(parentUserId: number): Promise<number> {
    return withRetry(async () => {
      const [rows] = await pool.execute(
        'SELECT COALESCE(SUM(quota_limit), 0) as total FROM sub_users WHERE parent_user_id = ?',
        [parentUserId]
      );
      return parseFloat((rows as any[])[0]?.total || '0');
    });
  },

  async getByParentUserId(parentUserId: number) {
    return withRetry(async () => {
      const [rows] = await pool.execute(
        'SELECT id, email, name, is_enabled, created_at, quota_limit, quota_consumed FROM sub_users WHERE parent_user_id = ? ORDER BY created_at DESC',
        [parentUserId]
      );
      return rows;
    });
  },

  async updateLastLogin(subUserId: number) {
    return withRetry(async () => {
      await pool.execute(
        'UPDATE sub_users SET last_login_at = NOW() WHERE id = ?',
        [subUserId]
      );
    });
  },

  async toggleEnabled(subUserId: number, isEnabled: boolean) {
    return withRetry(async () => {
      await pool.execute(
        'UPDATE sub_users SET is_enabled = ? WHERE id = ?',
        [isEnabled ? 1 : 0, subUserId]
      );
    });
  },

  async delete(subUserId: number) {
    return withRetry(async () => {
      await pool.execute(
        'DELETE FROM sub_users WHERE id = ?',
        [subUserId]
      );
    });
  }
};

// 邀请码数据库操作
export const inviteCodeDb = {
  async create(parentUserId: number) {
    return withRetry(async () => {
      const code = generateInviteCode();
      const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000 * 10); // 10年后过期（基本永不过期）
      
      const [result] = await pool.execute(
        'INSERT INTO invite_codes (parent_user_id, code, expires_at) VALUES (?, ?, ?)',
        [parentUserId, code, expiresAt]
      );
      return code;
    });
  },

  async validate(code: string) {
    return withRetry(async () => {
      const [rows] = await pool.execute(
        'SELECT * FROM invite_codes WHERE code = ? AND expires_at > NOW()',
        [code]
      );
      return (rows as any[])[0];
    });
  },

  async markAsUsed(code: string) {
    return withRetry(async () => {
      await pool.execute(
        'UPDATE invite_codes SET used_at = NOW() WHERE code = ?',
        [code]
      );
    });
  },

  async getByParentUserId(parentUserId: number) {
    return withRetry(async () => {
      const [rows] = await pool.execute(
        'SELECT code, expires_at, used_at FROM invite_codes WHERE parent_user_id = ? ORDER BY created_at DESC LIMIT 10',
        [parentUserId]
      );
      return rows;
    });
  }
};

// Banner轮播图历史记录数据库操作
export const bannerCarouselDb = {
  async create(userId: number, data: {
    productImages: string[];
    productDescription?: string;
    analysisResult?: object;
    generatedImages: { url: string; title: string }[];
    bannerCount: number;
    parentUserId?: number;
  }) {
    return await safeQuery(async (connection) => {
      const [result] = await connection.execute(
        `INSERT INTO banner_carousels 
         (user_id, parent_user_id, product_images, product_description, analysis_result, generated_images, banner_count) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          data.parentUserId || null,
          JSON.stringify(data.productImages),
          data.productDescription || null,
          data.analysisResult ? JSON.stringify(data.analysisResult) : null,
          JSON.stringify(data.generatedImages),
          data.bannerCount
        ]
      );
      return (result as any).insertId;
    });
  },

  async getByUserId(userId: number, page = 1, pageSize = 10) {
    return await safeQuery(async (connection) => {
      const offset = (page - 1) * pageSize;
      const [rows] = await connection.execute(
        `SELECT * FROM banner_carousels 
         WHERE user_id = ? 
         ORDER BY created_at DESC 
         LIMIT ? OFFSET ?`,
        [userId, pageSize, offset]
      );

      const [countResult] = await connection.execute(
        'SELECT COUNT(*) as total FROM banner_carousels WHERE user_id = ?',
        [userId]
      );

      const records = (rows as any[]).map(row => ({
        ...row,
        product_images: JSON.parse(row.product_images),
        analysis_result: row.analysis_result ? JSON.parse(row.analysis_result) : null,
        generated_images: JSON.parse(row.generated_images)
      }));

      return {
        records,
        total: (countResult as any[])[0]?.total || 0,
        page,
        pageSize
      };
    });
  },

  async getById(id: number, userId: number) {
    return await safeQuery(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT * FROM banner_carousels WHERE id = ? AND user_id = ?',
        [id, userId]
      );
      const row = (rows as any[])[0];
      if (!row) return null;

      return {
        ...row,
        product_images: JSON.parse(row.product_images),
        analysis_result: row.analysis_result ? JSON.parse(row.analysis_result) : null,
        generated_images: JSON.parse(row.generated_images)
      };
    });
  },

  async delete(id: number, userId: number) {
    return await safeQuery(async (connection) => {
      await connection.execute(
        'DELETE FROM banner_carousels WHERE id = ? AND user_id = ?',
        [id, userId]
      );
    });
  }
};
