const request = require('supertest');
const app = require('../src/server');
const User = require('../src/models/User');

describe('User Endpoints', () => {
  let accessToken;
  let userId;

  beforeEach(async () => {
    // Create and login a test user
    const userData = {
      email: 'test@example.com',
      password: 'password123',
      username: 'testuser',
      firstName: 'Test',
      lastName: 'User',
    };

    const response = await request(app)
      .post('/api/auth/register')
      .send(userData);

    accessToken = response.body.data.accessToken;
    userId = response.body.data.user.id;
  });

  describe('GET /api/user/profile', () => {
    it('should get user profile successfully', async () => {
      const response = await request(app)
        .get('/api/user/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.id).toBe(userId);
      expect(response.body.data.user.email).toBe('test@example.com');
      expect(response.body.data.user.stats).toBeDefined();
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/user/profile')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('PUT /api/user/profile', () => {
    it('should update user profile successfully', async () => {
      const updateData = {
        firstName: 'Updated',
        lastName: 'Name',
      };

      const response = await request(app)
        .put('/api/user/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.firstName).toBe('Updated');
      expect(response.body.data.user.lastName).toBe('Name');
    });

    it('should not allow duplicate username', async () => {
      // Create another user
      const anotherUser = new User({
        email: 'another@example.com',
        password: 'password123',
        username: 'anotheruser',
        firstName: 'Another',
        lastName: 'User',
      });
      await anotherUser.save();

      // Try to update to existing username
      const response = await request(app)
        .put('/api/user/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ username: 'anotheruser' })
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('taken');
    });

    it('should validate input data', async () => {
      const response = await request(app)
        .put('/api/user/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ firstName: 'A' }) // Too short
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });
  });

  describe('GET /api/user/credits', () => {
    it('should get user credits successfully', async () => {
      const response = await request(app)
        .get('/api/user/credits')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.credits).toBe(5); // Default credits
      expect(response.body.data.isPremium).toBe(false);
      expect(response.body.data.recentTransactions).toBeDefined();
    });
  });

  describe('GET /api/user/dashboard', () => {
    it('should get dashboard stats successfully', async () => {
      const response = await request(app)
        .get('/api/user/dashboard')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.stats).toBeDefined();
      expect(response.body.data.stats.credits).toBeDefined();
      expect(response.body.data.stats.generations).toBeDefined();
      expect(response.body.data.stats.spending).toBeDefined();
      expect(response.body.data.stats.premium).toBeDefined();
    });
  });

  describe('GET /api/user/notifications', () => {
    it('should get user notifications', async () => {
      const response = await request(app)
        .get('/api/user/notifications')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.notifications).toBeDefined();
      expect(Array.isArray(response.body.data.notifications)).toBe(true);
    });

    it('should show low credits warning for users with low credits', async () => {
      // Update user to have low credits
      await User.findByIdAndUpdate(userId, { credits: 1 });

      const response = await request(app)
        .get('/api/user/notifications')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const notifications = response.body.data.notifications;
      const lowCreditsNotification = notifications.find(n => n.id === 'low-credits');
      
      expect(lowCreditsNotification).toBeDefined();
      expect(lowCreditsNotification.type).toBe('warning');
    });

    it('should show welcome notification for new users', async () => {
      const response = await request(app)
        .get('/api/user/notifications')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const notifications = response.body.data.notifications;
      const welcomeNotification = notifications.find(n => n.id === 'welcome');
      
      expect(welcomeNotification).toBeDefined();
      expect(welcomeNotification.type).toBe('success');
    });
  });

  describe('GET /api/user/generations', () => {
    it('should get empty generation history for new user', async () => {
      const response = await request(app)
        .get('/api/user/generations')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
      expect(response.body.pagination.total).toBe(0);
    });

    it('should support pagination parameters', async () => {
      const response = await request(app)
        .get('/api/user/generations?page=1&limit=5')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(5);
    });
  });
});