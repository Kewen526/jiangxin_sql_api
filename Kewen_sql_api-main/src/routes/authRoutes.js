/**
 * 认证路由
 * 处理用户注册、登录等
 */

import * as authService from '../auth/authService.js';
import { requireAuth } from '../middleware/authMiddleware.js';

export default async function authRoutes(fastify, options) {

  /**
   * 用户注册
   * POST /api/auth/register
   */
  fastify.post('/api/auth/register', {
    schema: {
      body: {
        type: 'object',
        required: ['company', 'email', 'password'],
        properties: {
          company: { type: 'string', minLength: 2 },
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 6 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { company, email, password } = request.body;

      const result = await authService.register(company, email, password);

      return reply.send({
        success: true,
        data: result
      });

    } catch (error) {
      const errorMap = {
        'EMAIL_EXISTS': { status: 400, message: '该邮箱已注册' }
      };

      const errorInfo = errorMap[error.message] || {
        status: 500,
        message: '注册失败'
      };

      return reply.status(errorInfo.status).send({
        success: false,
        error: error.message,
        message: errorInfo.message
      });
    }
  });

  /**
   * 用户登录
   * POST /api/auth/login
   */
  fastify.post('/api/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { email, password } = request.body;

      const result = await authService.login(email, password);

      return reply.send({
        success: true,
        data: result
      });

    } catch (error) {
      const errorMap = {
        'USER_NOT_FOUND': { status: 404, message: '用户不存在' },
        'INVALID_PASSWORD': { status: 401, message: '密码错误' },
        'USER_DISABLED': { status: 403, message: '用户已被禁用' },
        'TENANT_DISABLED': { status: 403, message: '租户已被禁用' }
      };

      const errorInfo = errorMap[error.message] || {
        status: 500,
        message: '登录失败'
      };

      return reply.status(errorInfo.status).send({
        success: false,
        error: error.message,
        message: errorInfo.message
      });
    }
  });

  /**
   * 获取当前用户信息
   * GET /api/auth/me
   */
  fastify.get('/api/auth/me', {
    preHandler: requireAuth
  }, async (request, reply) => {
    try {
      const userInfo = await authService.getUserInfo(request.user.userId);

      return reply.send({
        success: true,
        data: userInfo
      });

    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error.message,
        message: '获取用户信息失败'
      });
    }
  });

  /**
   * 刷新 Token
   * POST /api/auth/refresh
   */
  fastify.post('/api/auth/refresh', {
    schema: {
      body: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { token } = request.body;

      const result = await authService.refreshToken(token);

      return reply.send({
        success: true,
        data: result
      });

    } catch (error) {
      const errorMap = {
        'TOKEN_EXPIRED': { status: 401, message: 'Token已过期' },
        'INVALID_TOKEN': { status: 401, message: 'Token无效' }
      };

      const errorInfo = errorMap[error.message] || {
        status: 500,
        message: '刷新Token失败'
      };

      return reply.status(errorInfo.status).send({
        success: false,
        error: error.message,
        message: errorInfo.message
      });
    }
  });

  /**
   * 退出登录
   * POST /api/auth/logout
   */
  fastify.post('/api/auth/logout', {
    preHandler: requireAuth
  }, async (request, reply) => {
    // JWT 是无状态的，退出登录只需前端删除 Token
    // 这里提供一个接口，方便前端统一处理
    return reply.send({
      success: true,
      message: '退出登录成功'
    });
  });

}
