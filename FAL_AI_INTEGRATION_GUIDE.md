# FAL AI Integration Guide

## Overview
The API has been updated to use fal.ai's Flux Pro model for AI image generation. This document outlines the changes and setup required.

## Changes Made

### 1. Package Installation
- ✅ Installed `@fal-ai/client` package
- ✅ Configured fal.ai client with API key

### 2. Controller Updates
- ✅ Updated `callFalAI()` function to use fal.ai Flux Pro Kontext model
- ✅ Changed API endpoint to use `fal.subscribe()` method
- ✅ Added support for multiple image generation (1-4 images)
- ✅ Updated request/response handling for new mobile app format

### 3. Model Schema Updates
- ✅ Made `originalImageUrl` optional (for text-to-image generations)
- ✅ Added new parameter fields: `prompt`, `negativePrompt`, `style`, `quality`, `steps`, `guidanceScale`, `imageCount`
- ✅ Added virtual properties for backward compatibility: `imageUrl`, `cost`
- ✅ Updated model enum to include `'fal-ai/flux-pro/kontext'`

### 4. Route Validation Updates
- ✅ Updated request validation schema to match new mobile app format
- ✅ Changed from `originalImageUrl` to optional `inputImageUrl`
- ✅ Added validation for all new parameters in `parameters` object

## API Endpoint Changes

### New Request Format
```json
POST /api/generate/create
{
  "inputImageUrl": "https://example.com/reference-image.jpg", // Optional
  "parameters": {
    "prompt": "A beautiful landscape with mountains",
    "negativePrompt": "blur, low quality", // Optional
    "style": "photographic", // Optional
    "quality": 2, // 1-4
    "steps": 25, // 10-50
    "guidanceScale": 7.5, // 1-20
    "seed": 12345, // Optional
    "width": 1024, // 512-2048
    "height": 1024, // 512-2048
    "imageCount": 2 // 1-4 images
  }
}
```

### Response Format
```json
{
  "success": true,
  "data": {
    "generationId": "64f8a1b2c3d4e5f6g7h8i9j0",
    "status": "pending",
    "creditsUsed": 2,
    "estimatedCompletionTime": "2-3 minutes"
  },
  "message": "Generation request created successfully"
}
```

## FAL AI Configuration

### Environment Setup
Add to `.env` file:
```env
FAL_AI_API_KEY=your_fal_ai_api_key_here
```

### Getting FAL AI API Key
1. Visit [fal.ai](https://fal.ai)
2. Create an account
3. Generate an API key from your dashboard
4. Add the key to your `.env` file

## FAL AI API Details

### Model Used
- **Model ID**: `fal-ai/flux-pro/kontext`
- **Type**: Image-to-image and text-to-image generation
- **Max Images**: 4 per request
- **Resolution**: Up to 2048x2048

### Request Parameters Sent to FAL AI
```javascript
{
  prompt: "User's text prompt",
  image_url: "Reference image URL (optional)",
  num_images: 1-4,
  guidance_scale: 7.5,
  num_inference_steps: 25,
  seed: null, // Optional
  width: 1024,
  height: 1024
}
```

### FAL AI Response Format
```javascript
{
  data: {
    images: [
      { url: "https://fal.media/files/generated-image-1.jpg" },
      { url: "https://fal.media/files/generated-image-2.jpg" }
    ]
  },
  requestId: "fal-request-id"
}
```

## Credit System

### Credit Calculation
- **Simple Model**: 1 credit per image generated
- **Example**: Requesting 3 images = 3 credits deducted

### Premium Users
- Premium users can generate unlimited images without credit deduction
- Credit calculation still runs but deduction is skipped

## Testing

### Prerequisites
1. FAL AI API key configured in `.env`
2. MongoDB running
3. User account with sufficient credits

### Test Request (cURL)
```bash
curl -X POST http://localhost:3000/api/generate/create \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "parameters": {
      "prompt": "A futuristic cityscape at sunset",
      "imageCount": 2,
      "quality": 3
    }
  }'
```

### Test with Reference Image
```bash
curl -X POST http://localhost:3000/api/generate/create \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "inputImageUrl": "https://example.com/reference.jpg",
    "parameters": {
      "prompt": "Transform this into a cyberpunk style",
      "imageCount": 1,
      "style": "digital-art"
    }
  }'
```

## Mobile App Compatibility

### Changes Required in Mobile App
- ✅ Request format updated to match new API schema
- ✅ Support for multiple image generation (imageCount parameter)
- ✅ Updated credit calculation display
- ✅ Response handling for multiple generated images

### Backward Compatibility
- Virtual `imageUrl` property provides single image URL for existing code
- Virtual `cost` property provides credit cost for existing code
- Database migrations not required - new fields are optional

## Error Handling

### Common Errors
1. **Invalid FAL AI API Key**: Check `.env` configuration
2. **Insufficient Credits**: User needs more credits or premium upgrade
3. **Invalid Parameters**: Check request validation schema
4. **FAL AI Service Down**: Retry mechanism or fallback needed

### Error Response Format
```json
{
  "success": false,
  "error": {
    "type": "VALIDATION_ERROR",
    "message": "Prompt is required and cannot be empty",
    "field": "prompt"
  }
}
```

## Production Deployment

### Checklist
- [ ] Set production FAL AI API key
- [ ] Monitor FAL AI usage/billing
- [ ] Set up error logging for FAL AI failures
- [ ] Configure retry mechanisms
- [ ] Test with real mobile app
- [ ] Monitor generation success rates

### Monitoring
- Log all FAL AI requests/responses
- Track generation success/failure rates
- Monitor credit usage patterns
- Set up alerts for service failures

## Next Steps

1. **Get FAL AI API Key**: Sign up at fal.ai and get your API key
2. **Update Environment**: Add the API key to your `.env` file
3. **Test Generation**: Use the provided cURL examples
4. **Mobile App Testing**: Test with the updated mobile app
5. **Production Deploy**: Deploy with proper monitoring

## Support

For issues with this integration:
- Check FAL AI documentation: https://fal.ai/models/fal-ai/flux-pro/kontext/api
- Review error logs in your application
- Test with simple prompts first
- Verify API key permissions