const AWS = require('aws-sdk');
// const cloudinary = require('cloudinary').v2; // Disabled - using S3 only
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const { logger } = require('./logger');

// Configure AWS S3
let s3;
if (config.aws.accessKeyId && config.aws.secretAccessKey) {
  s3 = new AWS.S3({
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey,
    region: config.aws.region,
  });
}

// Configure Cloudinary (disabled for now - using S3 only)
// if (config.cloudinary.cloudName && config.cloudinary.apiKey && config.cloudinary.apiSecret) {
//   cloudinary.config({
//     cloud_name: config.cloudinary.cloudName,
//     api_key: config.cloudinary.apiKey,
//     api_secret: config.cloudinary.apiSecret,
//   });
// }

const processImage = async (buffer, options = {}) => {
  const {
    width = 1024,
    height = 1024,
    quality = 80,
    format = 'jpeg',
  } = options;

  try {
    let processedImage = sharp(buffer);

    // Resize image while maintaining aspect ratio
    processedImage = processedImage.resize(width, height, {
      fit: 'inside',
      withoutEnlargement: true,
    });

    // Convert to specified format and compress
    if (format === 'jpeg') {
      processedImage = processedImage.jpeg({ quality });
    } else if (format === 'png') {
      processedImage = processedImage.png({ compressionLevel: 9 });
    } else if (format === 'webp') {
      processedImage = processedImage.webp({ quality });
    }

    return await processedImage.toBuffer();
  } catch (error) {
    logger.error('Image processing error:', error);
    throw new Error('Failed to process image');
  }
};

const uploadToS3 = async (buffer, fileName, contentType) => {
  if (!s3) {
    throw new Error('AWS S3 not configured');
  }

  const key = `uploads/${Date.now()}-${fileName}`;

  try {
    const uploadParams = {
      Bucket: config.aws.s3Bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ACL: 'public-read',
    };

    const result = await s3.upload(uploadParams).promise();
    
    logger.info(`File uploaded to S3: ${result.Location}`);
    return result.Location;
  } catch (error) {
    logger.error('S3 upload error:', error);
    throw new Error('Failed to upload to S3');
  }
};

const uploadToCloudinary = async (buffer, fileName, options = {}) => {
  if (!cloudinary.config().cloud_name) {
    throw new Error('Cloudinary not configured');
  }

  try {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'image',
          public_id: `uploads/${Date.now()}-${fileName.split('.')[0]}`,
          folder: 'mobile-app',
          ...options,
        },
        (error, result) => {
          if (error) {
            logger.error('Cloudinary upload error:', error);
            reject(new Error('Failed to upload to Cloudinary'));
          } else {
            logger.info(`File uploaded to Cloudinary: ${result.secure_url}`);
            resolve(result.secure_url);
          }
        }
      );

      uploadStream.end(buffer);
    });
  } catch (error) {
    logger.error('Cloudinary upload error:', error);
    throw new Error('Failed to upload to Cloudinary');
  }
};

const uploadImage = async (file, options = {}) => {
  const {
    processOptions = {},
    useS3 = true, // Default to S3, fallback to Cloudinary
  } = options;

  try {
    // Process the image
    const processedBuffer = await processImage(file.buffer, processOptions);
    
    const fileName = `${uuidv4()}.${processOptions.format || 'jpeg'}`;
    const contentType = `image/${processOptions.format || 'jpeg'}`;

    // Use S3 only
    if (s3) {
      return await uploadToS3(processedBuffer, fileName, contentType);
    }

    throw new Error('AWS S3 not configured. Please check your environment variables.');
  } catch (error) {
    logger.error('Image upload error:', error);
    throw error;
  }
};

const validateImageFile = (file) => {
  const errors = [];

  // Check file size
  if (file.size > config.upload.maxFileSize) {
    errors.push(`File size exceeds limit of ${config.upload.maxFileSize} bytes`);
  }

  // Check file type
  if (!config.upload.allowedTypes.includes(file.mimetype)) {
    errors.push(`File type ${file.mimetype} not allowed. Allowed types: ${config.upload.allowedTypes.join(', ')}`);
  }

  // Check if file exists
  if (!file.buffer || file.buffer.length === 0) {
    errors.push('No file data received');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

const generateThumbnail = async (imageBuffer, size = 200) => {
  try {
    return await sharp(imageBuffer)
      .resize(size, size, {
        fit: 'cover',
        position: 'center',
      })
      .jpeg({ quality: 70 })
      .toBuffer();
  } catch (error) {
    logger.error('Thumbnail generation error:', error);
    throw new Error('Failed to generate thumbnail');
  }
};

const deleteFromS3 = async (imageUrl) => {
  if (!s3 || !imageUrl.includes(config.aws.s3Bucket)) {
    return false;
  }

  try {
    const key = imageUrl.split('/').slice(-2).join('/'); // Get the key from URL
    
    await s3.deleteObject({
      Bucket: config.aws.s3Bucket,
      Key: key,
    }).promise();

    logger.info(`File deleted from S3: ${key}`);
    return true;
  } catch (error) {
    logger.error('S3 deletion error:', error);
    return false;
  }
};

const deleteFromCloudinary = async (imageUrl) => {
  if (!cloudinary.config().cloud_name || !imageUrl.includes('cloudinary.com')) {
    return false;
  }

  try {
    const publicId = imageUrl.split('/').slice(-2).join('/').split('.')[0];
    
    const result = await cloudinary.uploader.destroy(`mobile-app/${publicId}`);
    
    logger.info(`File deleted from Cloudinary: ${publicId}`);
    return result.result === 'ok';
  } catch (error) {
    logger.error('Cloudinary deletion error:', error);
    return false;
  }
};

const deleteImage = async (imageUrl) => {
  try {
    // Try S3 first
    const s3Deleted = await deleteFromS3(imageUrl);
    if (s3Deleted) return true;

    // Try Cloudinary
    const cloudinaryDeleted = await deleteFromCloudinary(imageUrl);
    return cloudinaryDeleted;
  } catch (error) {
    logger.error('Image deletion error:', error);
    return false;
  }
};

module.exports = {
  uploadImage,
  validateImageFile,
  processImage,
  generateThumbnail,
  deleteImage,
  uploadToS3,
  uploadToCloudinary,
};