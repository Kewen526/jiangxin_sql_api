/**
 * API 分组管理路由
 * 支持租户隔离的分组 CRUD
 */

import { query, queryOne, execute } from '../auth/platformDb.js';
import { requireAuth } from '../middleware/authMiddleware.js';

// 生成ID
function generateId(prefix = 'grp') {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 8; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}_${id}`;
}

export default async function groupRoutes(fastify, options) {

  /**
   * 获取当前租户的所有分组
   * GET /api/groups
   */
  fastify.get('/api/groups', {
    preHandler: requireAuth
  }, async (request, reply) => {
    try {
      const tenantId = request.user.tenantId;

      const groups = await query(
        `SELECT g.id, g.name, g.description, g.sort_order, g.created_at,
                COUNT(a.id) as api_count
         FROM api_groups g
         LEFT JOIN apis a ON g.id = a.group_id AND a.tenant_id = g.tenant_id
         WHERE g.tenant_id = ?
         GROUP BY g.id
         ORDER BY g.sort_order ASC, g.created_at DESC`,
        [tenantId]
      );

      return reply.send({
        success: true,
        data: groups
      });

    } catch (error) {
      console.error('获取分组列表失败:', error);
      return reply.status(500).send({
        success: false,
        message: '获取分组列表失败'
      });
    }
  });

  /**
   * 获取单个分组详情
   * GET /api/groups/:id
   */
  fastify.get('/api/groups/:id', {
    preHandler: requireAuth
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const tenantId = request.user.tenantId;

      const group = await queryOne(
        `SELECT id, name, description, sort_order, created_at
         FROM api_groups
         WHERE id = ? AND tenant_id = ?`,
        [id, tenantId]
      );

      if (!group) {
        return reply.status(404).send({
          success: false,
          message: '分组不存在'
        });
      }

      return reply.send({
        success: true,
        data: group
      });

    } catch (error) {
      console.error('获取分组详情失败:', error);
      return reply.status(500).send({
        success: false,
        message: '获取分组详情失败'
      });
    }
  });

  /**
   * 创建分组
   * POST /api/groups
   */
  fastify.post('/api/groups', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          description: { type: 'string', maxLength: 255 },
          sort_order: { type: 'integer', minimum: 0 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { name, description, sort_order } = request.body;
      const tenantId = request.user.tenantId;

      // 生成分组ID
      const groupId = generateId('grp');

      await execute(
        `INSERT INTO api_groups (id, tenant_id, name, description, sort_order, created_at)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [groupId, tenantId, name, description || null, sort_order || 0]
      );

      return reply.send({
        success: true,
        data: {
          id: groupId,
          name,
          description,
          sort_order: sort_order || 0
        },
        message: '分组创建成功'
      });

    } catch (error) {
      console.error('创建分组失败:', error);
      return reply.status(500).send({
        success: false,
        message: '创建分组失败'
      });
    }
  });

  /**
   * 更新分组
   * PUT /api/groups/:id
   */
  fastify.put('/api/groups/:id', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          description: { type: 'string', maxLength: 255 },
          sort_order: { type: 'integer', minimum: 0 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const tenantId = request.user.tenantId;
      const updates = request.body;

      // 检查分组是否存在
      const existing = await queryOne(
        'SELECT id FROM api_groups WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      if (!existing) {
        return reply.status(404).send({
          success: false,
          message: '分组不存在'
        });
      }

      // 构建更新语句
      const fields = [];
      const values = [];

      if (updates.name) {
        fields.push('name = ?');
        values.push(updates.name);
      }
      if (updates.description !== undefined) {
        fields.push('description = ?');
        values.push(updates.description);
      }
      if (updates.sort_order !== undefined) {
        fields.push('sort_order = ?');
        values.push(updates.sort_order);
      }

      if (fields.length > 0) {
        values.push(id, tenantId);

        await execute(
          `UPDATE api_groups SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`,
          values
        );
      }

      return reply.send({
        success: true,
        message: '分组更新成功'
      });

    } catch (error) {
      console.error('更新分组失败:', error);
      return reply.status(500).send({
        success: false,
        message: '更新分组失败'
      });
    }
  });

  /**
   * 删除分组
   * DELETE /api/groups/:id
   */
  fastify.delete('/api/groups/:id', {
    preHandler: requireAuth
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const tenantId = request.user.tenantId;

      // 检查是否有 API 在该分组下
      const apis = await query(
        'SELECT id FROM apis WHERE group_id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      if (apis.length > 0) {
        return reply.status(400).send({
          success: false,
          message: `该分组下有 ${apis.length} 个 API，请先移除或删除这些 API`
        });
      }

      // 删除分组
      const result = await execute(
        'DELETE FROM api_groups WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      if (result.affectedRows === 0) {
        return reply.status(404).send({
          success: false,
          message: '分组不存在'
        });
      }

      return reply.send({
        success: true,
        message: '分组删除成功'
      });

    } catch (error) {
      console.error('删除分组失败:', error);
      return reply.status(500).send({
        success: false,
        message: '删除分组失败'
      });
    }
  });

}
