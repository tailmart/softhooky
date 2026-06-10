import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { pool } from './db';
import dotenv from 'dotenv';
dotenv.config();
// 删除过期图片的定时任务
export async function cleanupExpiredImages() {
    console.log('🧹 开始清理过期图片...');
    try {
        // 查询所有过期的图片
        const [expiredImages] = await pool.execute('SELECT id, image_url FROM generated_images WHERE expires_at <= NOW()');
        const images = expiredImages;
        if (images.length === 0) {
            console.log('✅ 没有过期图片需要清理');
            return { success: true, deletedCount: 0 };
        }
        console.log(`📋 找到 ${images.length} 张过期图片`);
        // 初始化 S3 客户端
        const s3Client = new S3Client({
            region: 'auto',
            endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
            credentials: {
                accessKeyId: process.env.R2_ACCESS_KEY_ID,
                secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
            },
        });
        let r2DeletedCount = 0;
        let dbDeletedCount = 0;
        // 批量删除 R2 图片
        for (const image of images) {
            try {
                const key = image.image_url.replace(process.env.R2_PUBLIC_URL + '/', '');
                await s3Client.send(new DeleteObjectCommand({
                    Bucket: process.env.R2_BUCKET_NAME,
                    Key: key
                }));
                r2DeletedCount++;
                console.log(`✅ R2图片已删除: ${key}`);
            }
            catch (r2Error) {
                console.error(`❌ 删除R2图片失败: ${image.image_url}`, r2Error.message);
            }
        }
        // 从数据库批量删除
        const ids = images.map(img => img.id);
        const placeholders = ids.map(() => '?').join(',');
        const [result] = await pool.execute(`DELETE FROM generated_images WHERE id IN (${placeholders})`, ids);
        dbDeletedCount = result.affectedRows;
        console.log(`✅ 清理完成: ${dbDeletedCount} 条数据库记录, ${r2DeletedCount} 个R2文件`);
        return {
            success: true,
            deletedCount: dbDeletedCount,
            r2DeletedCount
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
// 启动定时任务（每小时执行一次）
export function startCleanupScheduler() {
    console.log('⏰ 启动图片清理定时任务（每小时执行一次）');
    // 立即执行一次
    cleanupExpiredImages();
    // 每小时执行一次
    setInterval(() => {
        cleanupExpiredImages();
    }, 60 * 60 * 1000); // 1小时
}
