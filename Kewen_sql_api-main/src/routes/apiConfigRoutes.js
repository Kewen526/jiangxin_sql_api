/**
 * API 配置管理路由
 * 支持租户隔离的 API CRUD
 */

import { query, queryOne, execute } from '../auth/platformDb.js';
import { requireAuth } from '../middleware/authMiddleware.js';

// 生成ID
function generateId(prefix = 'api') {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 8; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}_${id}`;
}

export default async function apiConfigRoutes(fastify, options) {

  /**
   * 获取当前租户的所有 API
   * GET /api/apis
   */
  fastify.get('/api/apis', {
    preHandler: requireAuth
  }, async (request, reply) => {
    try {
      const tenantId = request.user.tenantId;
      const { group_id } = request.query;

      let sql = `
        SELECT a.id, a.name, a.path, a.note, a.content_type, a.group_id, a.status, a.created_at,
               g.name as group_name
        FROM apis a
        LEFT JOIN api_groups g ON a.group_id = g.id
        WHERE a.tenant_id = ?
      `;
      const params = [tenantId];

      if (group_id) {
        sql += ' AND a.group_id = ?';
        params.push(group_id);
      }

      sql += ' ORDER BY a.created_at DESC';

      const apis = await query(sql, params);

      return reply.send({
        success: true,
        data: apis
      });

    } catch (error) {
      console.error('获取 API 列表失败:', error);
      return reply.status(500).send({
        success: false,
        message: '获取 API 列表失败'
      });
    }
  });

  /**
   * 获取单个 API 详情
   * GET /api/apis/:id
   */
  fastify.get('/api/apis/:id', {
    preHandler: requireAuth
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const tenantId = request.user.tenantId;

      const api = await queryOne(
        `SELECT a.*, g.name as group_name
         FROM apis a
         LEFT JOIN api_groups g ON a.group_id = g.id
         WHERE a.id = ? AND a.tenant_id = ?`,
        [id, tenantId]
      );

      if (!api) {
        return reply.status(404).send({
          success: false,
          message: 'API 不存在'
        });
      }

      // 解析 JSON 字段
      if (api.params) {
        api.params = JSON.parse(api.params);
      }
      if (api.sql_config) {
        api.sql_config = JSON.parse(api.sql_config);
      }
      if (api.test_params) {
        api.test_params = JSON.parse(api.test_params);
      }

      return reply.send({
        success: true,
        data: api
      });

    } catch (error) {
      console.error('获取 API 详情失败:', error);
      return reply.status(500).send({
        success: false,
        message: '获取 API 详情失败'
      });
    }
  });

  /**
   * 创建 API
   * POST /api/apis
   */
  fastify.post('/api/apis', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object',
        required: ['name', 'path', 'sql_config'],
        properties: {
          name: { type: 'string', minLength: 1 },
          path: { type: 'string', minLength: 1 },
          note: { type: 'string' },
          group_id: { type: 'string' },
          content_type: { type: 'string' },
          params: { type: 'array' },
          sql_config: { type: 'object' },
          test_params: { type: 'object' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { name, path, note, group_id, content_type, params, sql_config, test_params } = request.body;
      const tenantId = request.user.tenantId;

      // 检查路径是否已存在
      const existing = await queryOne(
        'SELECT id FROM apis WHERE tenant_id = ? AND path = ?',
        [tenantId, path]
      );

      if (existing) {
        return reply.status(400).send({
          success: false,
          message: '该路径已存在'
        });
      }

      // 生成 API ID
      const apiId = generateId('api');

      await execute(
        `INSERT INTO apis (id, tenant_id, group_id, name, path, note, content_type, params, sql_config, test_params, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())`,
        [
          apiId,
          tenantId,
          group_id || null,
          name,
          path,
          note || null,
          content_type || 'application/json',
          params ? JSON.stringify(params) : null,
          JSON.stringify(sql_config),
          test_params ? JSON.stringify(test_params) : null
        ]
      );

      return reply.send({
        success: true,
        data: {
          id: apiId,
          name,
          path,
          status: 1
        },
        message: 'API 创建成功'
      });

    } catch (error) {
      console.error('创建 API 失败:', error);
      return reply.status(500).send({
        success: false,
        message: '创建 API 失败'
      });
    }
  });

  /**
   * 更新 API
   * PUT /api/apis/:id
   */
  fastify.put('/api/apis/:id', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1 },
          path: { type: 'string', minLength: 1 },
          note: { type: 'string' },
          group_id: { type: 'string' },
          content_type: { type: 'string' },
          params: { type: 'array' },
          sql_config: { type: 'object' },
          test_params: { type: 'object' },
          status: { type: 'integer', enum: [0, 1] }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const tenantId = request.user.tenantId;
      const updates = request.body;

      // 检查 API 是否存在
      const existing = await queryOne(
        'SELECT * FROM apis WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      if (!existing) {
        return reply.status(404).send({
          success: false,
          message: 'API 不存在'
        });
      }

      // 如果修改路径，检查是否冲突
      if (updates.path && updates.path !== existing.path) {
        const conflict = await queryOne(
          'SELECT id FROM apis WHERE tenant_id = ? AND path = ? AND id != ?',
          [tenantId, updates.path, id]
        );

        if (conflict) {
          return reply.status(400).send({
            success: false,
            message: '该路径已存在'
          });
        }
      }

      // 构建更新语句
      const fields = [];
      const values = [];

      if (updates.name) {
        fields.push('name = ?');
        values.push(updates.name);
      }
      if (updates.path) {
        fields.push('path = ?');
        values.push(updates.path);
      }
      if (updates.note !== undefined) {
        fields.push('note = ?');
        values.push(updates.note);
      }
      if (updates.group_id !== undefined) {
        fields.push('group_id = ?');
        values.push(updates.group_id);
      }
      if (updates.content_type) {
        fields.push('content_type = ?');
        values.push(updates.content_type);
      }
      if (updates.params !== undefined) {
        fields.push('params = ?');
        values.push(JSON.stringify(updates.params));
      }
      if (updates.sql_config) {
        fields.push('sql_config = ?');
        values.push(JSON.stringify(updates.sql_config));
      }
      if (updates.test_params !== undefined) {
        fields.push('test_params = ?');
        values.push(JSON.stringify(updates.test_params));
      }
      if (updates.status !== undefined) {
        fields.push('status = ?');
        values.push(updates.status);
      }

      if (fields.length > 0) {
        fields.push('updated_at = NOW()');
        values.push(id, tenantId);

        await execute(
          `UPDATE apis SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`,
          values
        );
      }

      return reply.send({
        success: true,
        message: 'API 更新成功'
      });

    } catch (error) {
      console.error('更新 API 失败:', error);
      return reply.status(500).send({
        success: false,
        message: '更新 API 失败'
      });
    }
  });

  /**
   * 删除 API
   * DELETE /api/apis/:id
   */
  fastify.delete('/api/apis/:id', {
    preHandler: requireAuth
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const tenantId = request.user.tenantId;

      const result = await execute(
        'DELETE FROM apis WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      if (result.affectedRows === 0) {
        return reply.status(404).send({
          success: false,
          message: 'API 不存在'
        });
      }

      return reply.send({
        success: true,
        message: 'API 删除成功'
      });

    } catch (error) {
      console.error('删除 API 失败:', error);
      return reply.status(500).send({
        success: false,
        message: '删除 API 失败'
      });
    }
  });

  /**
   * 测试 API
   * POST /api/apis/:id/test
   */
  fastify.post('/api/apis/:id/test', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object',
        properties: {
          params: { type: 'object' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const tenantId = request.user.tenantId;
      const testParams = request.body.params || {};

      // 获取 API 配置
      const api = await queryOne(
        'SELECT * FROM apis WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      if (!api) {
        return reply.status(404).send({
          success: false,
          message: 'API 不存在'
        });
      }

      const sqlConfig = JSON.parse(api.sql_config);

      // 这里应该执行 SQL 并返回结果
      // 为了简化，这里只返回配置信息
      return reply.send({
        success: true,
        message: 'API 测试功能需要实现 SQL 执行逻辑',
        data: {
          api_id: id,
          sql_config: sqlConfig,
          test_params: testParams
        }
      });

    } catch (error) {
      console.error('测试 API 失败:', error);
      return reply.status(500).send({
        success: false,
        message: '测试 API 失败'
      });
    }
  });

}
