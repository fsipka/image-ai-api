# Mobile App API

A complete Node.js Express API for a mobile app with AI image generation capabilities, user management, payment processing, ad rewards, and comprehensive admin features.

## Features

### 🔐 Authentication & Authorization
- JWT-based authentication with refresh tokens
- Role-based access control (user, admin)
- Password hashing with bcrypt
- Token rotation and security

### 👤 User Management
- User registration and profile management
- Credit system with transactions
- Premium subscriptions
- Dashboard with statistics and analytics

### 🎨 AI Image Generation
- Upload reference images
- AI-powered image generation with FAL AI
- Multiple model support
- Generation history and status tracking
- Credit-based usage system

### 💳 Payment Processing
- Stripe integration for payments
- Credit packages and premium subscriptions
- Webhook handling for payment confirmations
- Refund processing
- Transaction history

### 📺 Ad Rewards System
- Ad watch sessions with fraud detection
- Daily limits and cooldown periods
- Credit rewards for completed ad views
- Comprehensive fraud prevention

### ⚙️ Admin Features
- User management and statistics
- Revenue analytics and reporting
- Generation monitoring
- Transaction oversight
- System health monitoring

### 🛡️ Security & Performance
- Rate limiting with express-rate-limit
- Input validation with Joi
- Security headers with Helmet
- Request logging and monitoring
- Error handling and logging
- Data sanitization against NoSQL injection

## Tech Stack

- **Runtime:** Node.js 18+
- **Framework:** Express.js
- **Database:** MongoDB with Mongoose
- **Authentication:** JWT (jsonwebtoken)
- **Payment Processing:** Stripe
- **File Upload:** Multer with AWS S3/Cloudinary
- **Image Processing:** Sharp
- **Validation:** Joi
- **Testing:** Jest with Supertest
- **Logging:** Winston
- **Containerization:** Docker & Docker Compose

## Quick Start

### Prerequisites
- Node.js 18+ and npm
- MongoDB instance
- Environment variables configured

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd mobile-app-api
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Configuration**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Set up environment variables**
   ```env
   # Server Configuration
   PORT=3000
   NODE_ENV=development
   
   # Database
   MONGODB_URI=mongodb://localhost:27017/mobile-app-api
   
   # JWT Configuration
   JWT_SECRET=your-super-secret-jwt-key
   JWT_EXPIRES_IN=7d
   JWT_REFRESH_SECRET=your-refresh-secret
   
   # Stripe Configuration
   STRIPE_SECRET_KEY=sk_test_your_stripe_key
   STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
   
   # FAL AI Configuration
   FAL_AI_API_KEY=your_fal_ai_key
   
   # Cloud Storage (choose one)
   AWS_ACCESS_KEY_ID=your_aws_key
   AWS_SECRET_ACCESS_KEY=your_aws_secret
   AWS_S3_BUCKET=your-bucket
   # OR
   CLOUDINARY_CLOUD_NAME=your_cloud_name
   CLOUDINARY_API_KEY=your_api_key
   CLOUDINARY_API_SECRET=your_api_secret
   ```

5. **Seed the database (optional)**
   ```bash
   npm run seed
   ```

6. **Start the server**
   ```bash
   npm run dev    # Development mode with nodemon
   npm start      # Production mode
   ```

### Using Docker

1. **Start with Docker Compose**
   ```bash
   docker-compose up -d
   ```

This will start:
- API server on port 3000
- MongoDB on port 27017
- Redis on port 6379
- Nginx reverse proxy on port 80

2. **View logs**
   ```bash
   docker-compose logs -f api
   ```

## API Documentation

### Base URL
```
http://localhost:3000/api
```

### Authentication Endpoints

#### Register User
```http
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123",
  "username": "username",
  "firstName": "First",
  "lastName": "Last"
}
```

#### Login
```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

#### Get Profile
```http
GET /auth/profile
Authorization: Bearer <access-token>
```

### User Management Endpoints

#### Get User Profile
```http
GET /user/profile
Authorization: Bearer <access-token>
```

#### Update Profile
```http
PUT /user/profile
Authorization: Bearer <access-token>

{
  "firstName": "Updated",
  "lastName": "Name"
}
```

#### Get Credits
```http
GET /user/credits
Authorization: Bearer <access-token>
```

### Generation Endpoints

#### Upload Reference Image
```http
POST /generate/upload
Authorization: Bearer <access-token>
Content-Type: multipart/form-data

{
  "image": <file>
}
```

#### Create Generation
```http
POST /generate/create
Authorization: Bearer <access-token>

{
  "originalImageUrl": "https://example.com/image.jpg",
  "prompt": "A beautiful sunset over mountains",
  "modelUsed": "fal-ai",
  "parameters": {
    "strength": 0.8,
    "guidance_scale": 7.5,
    "num_inference_steps": 50
  }
}
```

#### Get Generation
```http
GET /generate/:id
Authorization: Bearer <access-token>
```

### Payment Endpoints

#### Get Credit Packages
```http
GET /payment/packages
```

#### Create Payment Intent
```http
POST /payment/create-payment-intent
Authorization: Bearer <access-token>

{
  "packageId": "medium"
}
```

### Ad Watch Endpoints

#### Check Ad Availability
```http
GET /ads/available
Authorization: Bearer <access-token>
```

#### Start Ad Watch
```http
POST /ads/start
Authorization: Bearer <access-token>

{
  "adId": "ad_123",
  "adProvider": "admob"
}
```

#### Complete Ad Watch
```http
POST /ads/complete
Authorization: Bearer <access-token>

{
  "adWatchId": "watch_id",
  "watchDurationMs": 30000
}
```

### Admin Endpoints

#### Get App Statistics
```http
GET /admin/stats
Authorization: Bearer <admin-token>
```

#### Get Users
```http
GET /admin/users?page=1&limit=20
Authorization: Bearer <admin-token>
```

#### Add Credits to User
```http
POST /admin/users/:userId/credits
Authorization: Bearer <admin-token>

{
  "credits": 10,
  "reason": "Bonus credits"
}
```

## Database Schema

### User Model
```javascript
{
  email: String (unique, required),
  password: String (hashed, required),
  username: String (unique, required),
  firstName: String (required),
  lastName: String (required),
  credits: Number (default: 5),
  isPremium: Boolean (default: false),
  premiumExpiresAt: Date,
  profilePicture: String,
  role: String (enum: ['user', 'admin']),
  isActive: Boolean (default: true),
  lastLogin: Date,
  refreshTokens: Array,
  timestamps: true
}
```

### Generation Model
```javascript
{
  userId: ObjectId (ref: 'User'),
  originalImageUrl: String (required),
  generatedImageUrls: [String],
  prompt: String (required),
  modelUsed: String (enum),
  parameters: Object,
  creditsUsed: Number (required),
  status: String (enum: ['pending', 'processing', 'completed', 'failed']),
  processingTimeMs: Number,
  timestamps: true
}
```

### Transaction Model
```javascript
{
  userId: ObjectId (ref: 'User'),
  type: String (enum: ['credit_purchase', 'ad_watch', 'premium_subscription']),
  amount: Number (required),
  creditsAdded: Number (required),
  paymentId: String,
  status: String (enum: ['pending', 'completed', 'failed']),
  description: String,
  timestamps: true
}
```

## Testing

### Run Tests
```bash
npm test                # Run all tests
npm run test:watch      # Run tests in watch mode
npm run test:coverage   # Run tests with coverage
```

### Test Structure
- `tests/auth.test.js` - Authentication endpoint tests
- `tests/user.test.js` - User management endpoint tests
- `tests/models/` - Database model tests
- `tests/setup.js` - Test environment setup

## Development

### Database Seeding
```bash
npm run seed            # Seed database with sample data
node src/utils/seeder.js clear  # Clear all data
```

### Default Accounts (after seeding)
- **Admin:** admin@example.com / admin123
- **User 1:** john@example.com / password123
- **User 2:** jane@example.com / password123 (Premium)
- **User 3:** bob@example.com / password123

### Linting
```bash
npm run lint            # Check code style
npm run lint:fix        # Fix code style issues
```

### Logging
- Development: Console output with colors
- Production: File-based logging (`logs/` directory)
- Error logs: `logs/error.log`
- Combined logs: `logs/combined.log`

## Production Deployment

### Environment Setup
1. Set `NODE_ENV=production`
2. Use strong JWT secrets
3. Configure production database
4. Set up SSL certificates
5. Configure proper CORS origins
6. Set up monitoring and logging

### Docker Production
```bash
docker-compose -f docker-compose.yml up -d
```

### Health Checks
- API Health: `GET /health`
- Database connectivity check
- Service status monitoring

## Security Considerations

### Implemented Security Features
- JWT authentication with refresh tokens
- Password hashing with bcrypt
- Rate limiting on all endpoints
- Input validation and sanitization
- Security headers with Helmet
- CORS configuration
- NoSQL injection prevention
- Request logging and monitoring

### Recommendations
- Use HTTPS in production
- Implement API key authentication for external services
- Set up proper firewall rules
- Regular security audits
- Monitor for suspicious activity
- Backup strategies

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new features
5. Run the test suite
6. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For support and questions:
- Create an issue in the repository
- Check the API documentation at `/api/docs`
- Review the test files for usage examples

---

Built with ❤️ using Node.js, Express, and MongoDB.