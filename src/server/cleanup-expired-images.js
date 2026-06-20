"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupExpiredImages = cleanupExpiredImages;
exports.cleanupOldTransactions = cleanupOldTransactions;
exports.startCleanupScheduler = startCleanupScheduler;
const client_s3_1 = require("@aws-sdk/client-s3");
const db_1 = require("./db");
const dotenv_1 = __importDefault(require("dotenv"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config();
const cosClient = new client_s3_1.S3Client({
    region: process.env.COS_REGION,
    endpoint: `https://cos.${process.env.COS_REGION}.myqcloud.com`,
    credentials: {
        accessKeyId: process.env.COS_SECRET_ID,
        secretAccessKey: process.env.COS_SECRET_KEY,
    },
});
async function cleanupExpiredImages() {
    console.log('🧹 开始清理过期内容（3天前）...');
    try {
        const [expiredImages] = await db_1.pool.execute(`SELECT id, user_id, image_url, model FROM generated_images
       WHERE expires_at <= NOW() OR (expires_at IS NULL AND created_at < DATE_SUB(NOW(), INTERVAL 3 DAY))`);
        const images = expiredImages;
        if (images.length === 0) {
            console.log('✅ 没有过期内容需要清理');
            return { success: true, deletedCount: 0 };
        }
        console.log(`📋 找到 ${images.length} 个过期内容（3天前）`);
        const cosPublicUrl = process.env.COS_PUBLIC_URL || '';
        let cosDeletedCount = 0;
        let localDeletedCount = 0;
        const deletedUrls = [];
        for (const image of images) {
            const imageUrl = image.image_url;
            // 1. 删除本地 /upload/ 文件
            if (imageUrl.startsWith('/upload/') || imageUrl.includes('/upload/')) {
                try {
                    let filePath = imageUrl;
                    if (imageUrl.startsWith('http')) {
                        filePath = new URL(imageUrl).pathname;
                    }
                    const fullPath = path_1.default.join(process.cwd(), filePath);
                    if (fs_1.default.existsSync(fullPath)) {
                        fs_1.default.unlinkSync(fullPath);
                        localDeletedCount++;
                        console.log(`✅ 本地图片已删除: ${fullPath}`);
                    }
                    deletedUrls.push(imageUrl);
                }
                catch (localError) {
                    console.error(`❌ 删除本地图片失败: ${imageUrl}`, localError.message);
                }
                continue;
            }
            // 2. 删除 COS 图片
            if (imageUrl.includes(cosPublicUrl)) {
                try {
                    const key = imageUrl.replace(cosPublicUrl + '/', '').replace(cosPublicUrl, '');
                    const cleanKey = key.startsWith('/') ? key.substring(1) : key;
                    await cosClient.send(new client_s3_1.DeleteObjectCommand({
                        Bucket: process.env.COS_BUCKET,
                        Key: cleanKey
                    }));
                    cosDeletedCount++;
                    deletedUrls.push(imageUrl);
                    console.log(`✅ COS图片已删除: ${cleanKey}`);
                }
                catch (cosError) {
                    console.error(`❌ 删除COS图片失败: ${imageUrl}`, cosError.message);
                }
            }
        }
        // 3. 从数据库删除过期记录
        const ids = images.map(img => img.id);
        const placeholders = ids.map(() => '?').join(',');
        const [result] = await db_1.pool.execute(`DELETE FROM generated_images WHERE id IN (${placeholders})`, ids);
        const dbDeletedCount = result.affectedRows;
        console.log(`✅ 清理完成: ${dbDeletedCount} 条数据库记录, ${cosDeletedCount} 个COS文件, ${localDeletedCount} 个本地文件`);
        return {
            success: true,
            deletedCount: dbDeletedCount,
            cosDeletedCount,
            localDeletedCount
        };
    }
    catch (error) {
        console.error('❌ 清理过期图片失败:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}
async function cleanupOldTransactions() {
    console.log('🧾 开始清理旧消费记录（10天前）...');
    try {
        const [result] = await db_1.pool.execute('DELETE FROM credit_transactions WHERE created_at < DATE_SUB(NOW(), INTERVAL 10 DAY)');
        const deletedCount = result.affectedRows;
        if (deletedCount > 0) {
            console.log(`✅ 已清理 ${deletedCount} 条旧消费记录`);
        }
        else {
            console.log('✅ 没有需要清理的旧消费记录');
        }
        return { success: true, deletedCount };
    }
    catch (error) {
        console.error('❌ 清理旧消费记录失败:', error.message);
        return { success: false, error: error.message };
    }
}
// 清理过期优惠券积分
async function cleanupExpiredCouponCredits() {
    try {
        const [expiredClaims] = await db_1.pool.execute(`SELECT cc.id, cc.user_id, cc.credits, cc.coupon_id
       FROM coupon_claims cc
       WHERE cc.expires_at < NOW() AND cc.expired = 0
       LIMIT 100`);
        const claims = expiredClaims;
        if (claims.length === 0) {
            console.log('✅ 没有需要清理的过期优惠券积分');
            return;
        }
        for (const claim of claims) {
            const connection = await db_1.pool.getConnection();
            try {
                await connection.beginTransaction();
                // 扣除过期积分（但不能扣成负数）
                await connection.execute('UPDATE users SET credits = GREATEST(0, credits - ?) WHERE id = ?', [claim.credits, claim.user_id]);
                await connection.execute('UPDATE coupon_claims SET expired = 1 WHERE id = ?', [claim.id]);
                await connection.execute('INSERT INTO credit_transactions (user_id, amount, type, description) VALUES (?, ?, ?, ?)', [claim.user_id, -claim.credits, 'expired', `优惠券积分过期: #${claim.coupon_id}`]);
                await connection.commit();
                console.log(`✅ 已清理用户 ${claim.user_id} 过期优惠券积分 ${claim.credits}`);
            }
            catch (err) {
                await connection.rollback();
                throw err;
            }
            finally {
                connection.release();
            }
        }
        console.log(`✅ 过期优惠券积分清理完成，共处理 ${claims.length} 条`);
    }
    catch (error) {
        console.error('❌ 清理过期优惠券积分失败:', error.message);
    }
}
function startCleanupScheduler() {
    console.log('⏰ 启动定时清理任务（每小时执行一次）');
    cleanupExpiredImages();
    cleanupOldTransactions();
    cleanupExpiredCouponCredits();
    setInterval(() => {
        cleanupExpiredImages();
        cleanupOldTransactions();
        cleanupExpiredCouponCredits();
    }, 60 * 60 * 1000);
}
