/**
 * API 文档路由
 * 自动生成API文档
 */

import { query } from '../auth/platformDb.js';

export default async function apiDocsRoutes(fastify, options) {

  /**
   * 获取API文档数据（公开）
   * GET /api/docs/data
   */
  fastify.get('/api/docs/data', async (request, reply) => {
    try {
      const { tenant_id } = request.query;

      if (!tenant_id) {
        return reply.status(400).send({
          success: false,
          message: '缺少 tenant_id 参数'
        });
      }

      // 获取租户信息
      const tenant = await query(
        'SELECT id, name FROM tenants WHERE id = ? AND status = 1',
        [tenant_id]
      ).then(rows => rows[0]);

      if (!tenant) {
        return reply.status(404).send({
          success: false,
          message: '租户不存在'
        });
      }

      // 获取所有启用的API分组
      const groups = await query(
        'SELECT id, name, description, sort_order FROM api_groups WHERE tenant_id = ? ORDER BY sort_order, name',
        [tenant_id]
      );

      // 获取所有启用的API
      const apis = await query(
        `SELECT a.id, a.name, a.path, a.note, a.content_type, a.params, a.sql_config, a.test_params, a.group_id
         FROM apis a
         WHERE a.tenant_id = ? AND a.status = 1
         ORDER BY a.name`,
        [tenant_id]
      );

      // 解析JSON字段
      const parsedAPIs = apis.map(api => ({
        ...api,
        params: api.params ? JSON.parse(api.params) : [],
        sql_config: api.sql_config ? JSON.parse(api.sql_config) : {},
        test_params: api.test_params ? JSON.parse(api.test_params) : {}
      }));

      // 按分组组织API
      const groupedAPIs = {};
      groups.forEach(group => {
        groupedAPIs[group.id] = {
          ...group,
          apis: []
        };
      });

      // 未分组的API
      groupedAPIs['_ungrouped'] = {
        id: null,
        name: '未分组',
        description: null,
        apis: []
      };

      parsedAPIs.forEach(api => {
        const groupId = api.group_id || '_ungrouped';
        if (groupedAPIs[groupId]) {
          groupedAPIs[groupId].apis.push(api);
        }
      });

      return reply.send({
        success: true,
        data: {
          tenant,
          groups: Object.values(groupedAPIs).filter(g => g.apis.length > 0)
        }
      });

    } catch (error) {
      console.error('获取API文档数据失败:', error);
      return reply.status(500).send({
        success: false,
        message: '获取API文档数据失败'
      });
    }
  });

}
