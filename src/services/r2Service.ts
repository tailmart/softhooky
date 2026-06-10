// 向后兼容：统一指向 COS 服务
import { uploadFileToCos, uploadImageToCos, uploadImagesToCos, fileToDataUrl } from './cosService';

export { fileToDataUrl } from './cosService';
export const uploadFileToR2 = uploadFileToCos;
export const uploadImageToR2 = uploadImageToCos;
export const uploadImagesToR2 = uploadImagesToCos;
