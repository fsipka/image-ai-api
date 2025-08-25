const mongoose = require('mongoose');
const User = require('../../src/models/User');

describe('User Model', () => {
  describe('User Creation', () => {
    it('should create a user successfully', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User',
      };

      const user = new User(userData);
      const savedUser = await user.save();

      expect(savedUser.email).toBe(userData.email);
      expect(savedUser.username).toBe(userData.username);
      expect(savedUser.firstName).toBe(userData.firstName);
      expect(savedUser.lastName).toBe(userData.lastName);
      expect(savedUser.credits).toBe(5); // Default credits
      expect(savedUser.isPremium).toBe(false); // Default premium status
      expect(savedUser.role).toBe('user'); // Default role
      expect(savedUser.isActive).toBe(true); // Default active status
    });

    it('should hash password before saving', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User',
      };

      const user = new User(userData);
      const savedUser = await user.save();

      // Password should be hashed
      expect(savedUser.password).not.toBe(userData.password);
      expect(savedUser.password).toMatch(/^\$2[aby]?\$\d+\$/); // bcrypt hash pattern
    });

    it('should require email field', async () => {
      const userData = {
        password: 'password123',
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User',
      };

      const user = new User(userData);
      
      await expect(user.save()).rejects.toThrow();
    });

    it('should require unique email', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        username: 'testuser1',
        firstName: 'Test',
        lastName: 'User',
      };

      const user1 = new User(userData);
      await user1.save();

      const user2 = new User({ ...userData, username: 'testuser2' });
      
      await expect(user2.save()).rejects.toThrow();
    });

    it('should require unique username', async () => {
      const user1 = new User({
        email: 'test1@example.com',
        password: 'password123',
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User',
      });
      await user1.save();

      const user2 = new User({
        email: 'test2@example.com',
        password: 'password123',
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User',
      });
      
      await expect(user2.save()).rejects.toThrow();
    });

    it('should validate email format', async () => {
      const userData = {
        email: 'invalid-email',
        password: 'password123',
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User',
      };

      const user = new User(userData);
      
      await expect(user.save()).rejects.toThrow();
    });

    it('should validate minimum password length', async () => {
      const userData = {
        email: 'test@example.com',
        password: '123',
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User',
      };

      const user = new User(userData);
      
      await expect(user.save()).rejects.toThrow();
    });
  });

  describe('User Methods', () => {
    let user;

    beforeEach(async () => {
      user = new User({
        email: 'test@example.com',
        password: 'password123',
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User',
      });
      await user.save();
    });

    describe('comparePassword', () => {
      it('should return true for correct password', async () => {
        const isValid = await user.comparePassword('password123');
        expect(isValid).toBe(true);
      });

      it('should return false for incorrect password', async () => {
        const isValid = await user.comparePassword('wrongpassword');
        expect(isValid).toBe(false);
      });
    });

    describe('deductCredits', () => {
      it('should deduct credits successfully', async () => {
        const initialCredits = user.credits;
        await user.deductCredits(2);
        
        expect(user.credits).toBe(initialCredits - 2);
      });

      it('should throw error if insufficient credits', async () => {
        await expect(user.deductCredits(10)).rejects.toThrow('Insufficient credits');
      });
    });

    describe('addCredits', () => {
      it('should add credits successfully', async () => {
        const initialCredits = user.credits;
        await user.addCredits(5);
        
        expect(user.credits).toBe(initialCredits + 5);
      });
    });

    describe('activatePremium', () => {
      it('should activate premium successfully', async () => {
        await user.activatePremium(30);
        
        expect(user.isPremium).toBe(true);
        expect(user.premiumExpiresAt).toBeDefined();
        
        // Should expire approximately 30 days from now
        const expectedExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        const actualExpiry = user.premiumExpiresAt;
        const timeDifference = Math.abs(expectedExpiry.getTime() - actualExpiry.getTime());
        
        expect(timeDifference).toBeLessThan(1000); // Within 1 second
      });
    });
  });

  describe('Virtual Properties', () => {
    let user;

    beforeEach(async () => {
      user = new User({
        email: 'test@example.com',
        password: 'password123',
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User',
      });
      await user.save();
    });

    describe('fullName', () => {
      it('should return concatenated first and last name', () => {
        expect(user.fullName).toBe('Test User');
      });
    });

    describe('isPremiumActive', () => {
      it('should return false for non-premium user', () => {
        expect(user.isPremiumActive).toBe(false);
      });

      it('should return true for active premium user', async () => {
        await user.activatePremium(30);
        expect(user.isPremiumActive).toBe(true);
      });

      it('should return false for expired premium user', async () => {
        user.isPremium = true;
        user.premiumExpiresAt = new Date(Date.now() - 24 * 60 * 60 * 1000); // Yesterday
        await user.save();
        
        expect(user.isPremiumActive).toBe(false);
      });
    });
  });
});