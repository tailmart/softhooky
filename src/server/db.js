import mysql from 'mysql2/promise';
import crypto from 'crypto';
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
        }
        catch (err) {
            const errorMsg = err.message || err.code || String(err);
            console.error(`❌ 数据库连接失败 (尝试 ${i}/${retries}): ${errorMsg}`);
            if (i < retries) {
                const delay = Math.min(10000, i * 2000); // 指数退避：2秒、4秒、6秒、8秒、10秒
                console.log(`⏳ 等待${delay}ms后重试...`);
                await new Promise(r => setTimeout(r, delay));
            }
            else {
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
export function isDbConnected() {
    return dbConnected;
}
// 添加连接池错误处理
pool.on('error', (err) => {
    console.error('❌ 连接池错误:', err.message);
});
// 监控连接池状态
setInterval(() => {
    const poolInfo = pool.pool;
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
export function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}
// 生成随机 token
export function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}
// 生成邀请码
export function generateInviteCode() {
    return crypto.randomBytes(6).toString('hex').toUpperCase();
}
// 安全执行数据库查询的辅助函数
export async function safeQuery(queryFn, retries = 3) {
    let lastError;
    for (let attempt = 1; attempt <= retries; attempt++) {
        let connection = null;
        try {
            connection = await pool.getConnection();
            const result = await queryFn(connection);
            connection.release();
            return result;
        }
        catch (error) {
            lastError = error;
            if (connection) {
                try {
                    connection.release();
                }
                catch (releaseError) {
                    console.error('释放连接失败:', releaseError);
                }
            }
            console.error(`数据库查询失败 (尝试 ${attempt}/${retries}):`, error.message);
            // 如果是连接错误，等待后重试
            if (attempt < retries && (error.message.includes('closed state') ||
                error.message.includes('Connection lost') ||
                error.code === 'PROTOCOL_CONNECTION_LOST')) {
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                continue;
            }
            throw error;
        }
    }
    throw lastError;
}
// 数据库操作重试包装器
export async function withRetry(operation, maxRetries = 3, delay = 1000) {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await operation();
        }
        catch (error) {
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
    async findByEmail(email) {
        return withRetry(async () => {
            const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);
            return rows[0];
        });
    },
    async findById(id) {
        return withRetry(async () => {
            const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [id]);
            return rows[0];
        });
    },
    async create(email, passwordHash, apiKey) {
        return withRetry(async () => {
            const [result] = await pool.execute('INSERT INTO users (email, password_hash, credits, api_key) VALUES (?, ?, 0, ?)', [email, passwordHash, apiKey || null]);
            return result.insertId;
        });
    },
    async updateLastLogin(userId) {
        return withRetry(async () => {
            await pool.execute('UPDATE users SET last_login_at = NOW() WHERE id = ?', [userId]);
        });
    },
    async updateCredits(userId, credits) {
        return withRetry(async () => {
            await pool.execute('UPDATE users SET credits = ? WHERE id = ?', [credits, userId]);
        });
    },
    async updateApiKey(email, apiKey) {
        return withRetry(async () => {
            await pool.execute('UPDATE users SET api_key = ? WHERE email = ?', [apiKey, email]);
        });
    }
};
// 会话数据库操作
export const sessionDb = {
    async create(userId, token, ipAddress) {
        return withRetry(async () => {
            const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7天后过期
            // 如果提供了 IP 地址，先删除该用户在该 IP 的所有旧会话（踢下线）
            if (ipAddress) {
                await pool.execute('DELETE FROM sessions WHERE user_id = ? AND ip_address = ?', [userId, ipAddress]);
            }
            await pool.execute('INSERT INTO sessions (user_id, token, expires_at, ip_address) VALUES (?, ?, ?, ?)', [userId, token, expiresAt, ipAddress || null]);
        });
    },
    async validate(token) {
        return withRetry(async () => {
            const [rows] = await pool.execute(`SELECT s.*, u.email, u.credits 
         FROM sessions s 
         JOIN users u ON s.user_id = u.id 
         WHERE s.token = ? AND s.expires_at > NOW()`, [token]);
            return rows[0];
        });
    },
    async delete(token) {
        return withRetry(async () => {
            await pool.execute('DELETE FROM sessions WHERE token = ?', [token]);
        });
    },
    async deleteByUserAndIp(userId, ipAddress) {
        return withRetry(async () => {
            await pool.execute('DELETE FROM sessions WHERE user_id = ? AND ip_address = ?', [userId, ipAddress]);
        });
    }
};
// 积分交易记录操作
export const creditTransactionDb = {
    async create(userId, amount, type, description) {
        await pool.execute('INSERT INTO credit_transactions (user_id, amount, type, description) VALUES (?, ?, ?, ?)', [userId, amount, type, description]);
    },
    async getByUserId(userId) {
        const [rows] = await pool.execute('SELECT * FROM credit_transactions WHERE user_id = ? ORDER BY created_at DESC', [userId]);
        return rows;
    },
    async deduct(userId, amount, type, description, parentUserId) {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            // 检查积分是否足够
            const [users] = await connection.execute('SELECT credits FROM users WHERE id = ? FOR UPDATE', [userId]);
            const currentCredits = users[0]?.credits || 0;
            if (currentCredits < amount) {
                await connection.rollback();
                return { success: false, message: '积分不足' };
            }
            // 扣除积分
            await connection.execute('UPDATE users SET credits = credits - ? WHERE id = ?', [amount, userId]);
            // 记录交易
            await connection.execute('INSERT INTO credit_transactions (user_id, parent_user_id, amount, type, description) VALUES (?, ?, ?, ?, ?)', [userId, parentUserId || null, -amount, type, description]);
            await connection.commit();
            // 获取最新积分
            const [updated] = await connection.execute('SELECT credits FROM users WHERE id = ?', [userId]);
            return { success: true, credits: updated[0]?.credits || 0 };
        }
        catch (error) {
            await connection.rollback();
            throw error;
        }
        finally {
            connection.release();
        }
    }
};
// 生成的图片记录数据库操作
export const generatedImagesDb = {
    async create(userId, imageUrl, prompt, options) {
        return await safeQuery(async (connection) => {
            console.log('🔍 Creating image record:', { userId, imageUrl: imageUrl.substring(0, 100), type: options?.type });
            // Check 1: existing image with same URL for this user
            const [existing] = await connection.execute('SELECT id, type FROM generated_images WHERE user_id = ? AND image_url = ?', [userId, imageUrl]);
            if (existing.length > 0) {
                const existingId = existing[0].id;
                const existingType = existing[0].type;
                // 如果已存在但type不同，更新type（特别是chatgen类型）
                if (options?.type && existingType !== options.type) {
                    console.log('🔄 Updating image type from', existingType, 'to', options.type, 'for ID:', existingId);
                    await connection.execute('UPDATE generated_images SET type = ? WHERE id = ?', [options.type, existingId]);
                }
                console.log('⚠️ Image already exists for user:', userId, 'Existing ID:', existingId);
                return existingId;
            }
            // Check 2: recent image with same prompt from same user (within 30 seconds)
            // This prevents duplicates when R2 generates different URLs for the same image
            if (prompt) {
                const [recentExisting] = await connection.execute(`SELECT id, type FROM generated_images 
           WHERE user_id = ? AND prompt = ? AND created_at > DATE_SUB(NOW(), INTERVAL 30 SECOND)`, [userId, prompt]);
                if (recentExisting.length > 0) {
                    const recentId = recentExisting[0].id;
                    const recentType = recentExisting[0].type;
                    // 如果已存在但type不同，更新type
                    if (options?.type && recentType !== options.type) {
                        console.log('🔄 Updating recent image type from', recentType, 'to', options.type, 'for ID:', recentId);
                        await connection.execute('UPDATE generated_images SET type = ? WHERE id = ?', [options.type, recentId]);
                    }
                    console.log('⚠️ Recent image with same prompt already exists for user:', userId, 'Existing ID:', recentId, 'Created at:', recentExisting[0].created_at);
                    return recentId;
                }
            }
            const [result] = await connection.execute('INSERT INTO generated_images (user_id, parent_user_id, image_url, prompt, model, aspect_ratio, resolution, type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
                userId,
                options?.parentUserId || null,
                imageUrl,
                prompt || null,
                options?.model || 'gemini-3.1-flash-image-preview',
                options?.aspectRatio || '智能',
                options?.resolution || '1K',
                options?.type || 'generated'
            ]);
            console.log('✅ Created new image record with ID:', result.insertId);
            return result.insertId;
        });
    },
    async getByUserId(userId, page = 1, pageSize = 20) {
        const offset = (page - 1) * pageSize;
        console.log('🔍 Querying images for user:', userId, 'page:', page, 'pageSize:', pageSize);
        const [rows] = await pool.execute(`SELECT * FROM generated_images 
       WHERE user_id = ? 
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`, [userId, pageSize, offset]);
        const imageRows = rows;
        console.log('🔍 DB Query Result for user', userId, ':', imageRows.length, 'images');
        console.log('🔍 DB Image IDs:', imageRows.map(row => row.id));
        console.log('🔍 DB Image URLs:', imageRows.map(row => row.image_url.substring(0, 50) + '...'));
        // 检查是否有重复的URL
        const urlCounts = new Map();
        imageRows.forEach(row => {
            const count = urlCounts.get(row.image_url) || 0;
            urlCounts.set(row.image_url, count + 1);
        });
        const duplicates = Array.from(urlCounts.entries()).filter(([url, count]) => count > 1);
        if (duplicates.length > 0) {
            console.log('⚠️ Found duplicate URLs in database result:', duplicates);
        }
        const [countResult] = await pool.execute('SELECT COUNT(*) as total FROM generated_images WHERE user_id = ?', [userId]);
        return {
            images: imageRows,
            total: countResult[0]?.total || 0,
            page,
            pageSize,
            totalPages: Math.ceil((countResult[0]?.total || 0) / pageSize)
        };
    },
    async delete(id, userId) {
        await pool.execute('DELETE FROM generated_images WHERE id = ? AND user_id = ?', [id, userId]);
    }
};
// 子账号数据库操作
export const subUserDb = {
    async create(parentUserId, email, passwordHash, name) {
        return withRetry(async () => {
            const [result] = await pool.execute('INSERT INTO sub_users (parent_user_id, email, password_hash, name, is_enabled) VALUES (?, ?, ?, ?, 1)', [parentUserId, email, passwordHash, name]);
            return result.insertId;
        });
    },
    async findByEmail(email) {
        return withRetry(async () => {
            const [rows] = await pool.execute('SELECT * FROM sub_users WHERE email = ?', [email]);
            return rows[0];
        });
    },
    async findById(id) {
        return withRetry(async () => {
            const [rows] = await pool.execute('SELECT * FROM sub_users WHERE id = ?', [id]);
            return rows[0];
        });
    },
    async getByParentUserId(parentUserId) {
        return withRetry(async () => {
            const [rows] = await pool.execute('SELECT id, email, name, is_enabled, created_at FROM sub_users WHERE parent_user_id = ? ORDER BY created_at DESC', [parentUserId]);
            return rows;
        });
    },
    async updateLastLogin(subUserId) {
        return withRetry(async () => {
            await pool.execute('UPDATE sub_users SET last_login_at = NOW() WHERE id = ?', [subUserId]);
        });
    },
    async toggleEnabled(subUserId, isEnabled) {
        return withRetry(async () => {
            await pool.execute('UPDATE sub_users SET is_enabled = ? WHERE id = ?', [isEnabled ? 1 : 0, subUserId]);
        });
    },
    async delete(subUserId) {
        return withRetry(async () => {
            await pool.execute('DELETE FROM sub_users WHERE id = ?', [subUserId]);
        });
    }
};
// 邀请码数据库操作
export const inviteCodeDb = {
    async create(parentUserId) {
        return withRetry(async () => {
            const code = generateInviteCode();
            const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30天后过期
            const [result] = await pool.execute('INSERT INTO invite_codes (parent_user_id, code, expires_at) VALUES (?, ?, ?)', [parentUserId, code, expiresAt]);
            return code;
        });
    },
    async validate(code) {
        return withRetry(async () => {
            const [rows] = await pool.execute('SELECT * FROM invite_codes WHERE code = ? AND expires_at > NOW()', [code]);
            return rows[0];
        });
    },
    async markAsUsed(code) {
        return withRetry(async () => {
            await pool.execute('UPDATE invite_codes SET used_at = NOW() WHERE code = ?', [code]);
        });
    },
    async getByParentUserId(parentUserId) {
        return withRetry(async () => {
            const [rows] = await pool.execute('SELECT code, expires_at, used_at FROM invite_codes WHERE parent_user_id = ? ORDER BY created_at DESC LIMIT 10', [parentUserId]);
            return rows;
        });
    }
};
