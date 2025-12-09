-- ================================================
-- SQL API 平台 - 完整清理和初始化脚本
-- ================================================
-- 使用说明：
-- mysql -h localhost -u root -p < database_cleanup_and_init.sql
-- ================================================

-- 创建数据库
CREATE DATABASE IF NOT EXISTS sql_api_platform
    DEFAULT CHARACTER SET utf8mb4
    DEFAULT COLLATE utf8mb4_unicode_ci;

USE sql_api_platform;

-- ================================================
-- 第一部分：清空所有旧数据
-- ================================================

SET FOREIGN_KEY_CHECKS = 0;

-- 清空所有表数据
TRUNCATE TABLE IF EXISTS api_logs;
TRUNCATE TABLE IF EXISTS apis;
TRUNCATE TABLE IF EXISTS api_groups;
TRUNCATE TABLE IF EXISTS datasources;
TRUNCATE TABLE IF EXISTS users;
TRUNCATE TABLE IF EXISTS tenants;

SET FOREIGN_KEY_CHECKS = 1;

-- ================================================
-- 第二部分：创建表结构
-- ================================================

-- 1. 租户表
CREATE TABLE IF NOT EXISTS tenants (
    id VARCHAR(32) PRIMARY KEY,
    name VARCHAR(100) NOT NULL COMMENT '公司/团队名称',
    status TINYINT DEFAULT 1 COMMENT '1=启用 0=禁用',
    created_at DATETIME DEFAULT NOW(),
    updated_at DATETIME DEFAULT NOW() ON UPDATE NOW()
) COMMENT '租户表';

-- 2. 用户表
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(32) PRIMARY KEY,
    tenant_id VARCHAR(32) NOT NULL COMMENT '所属租户',
    email VARCHAR(100) NOT NULL COMMENT '邮箱（登录账号）',
    password_hash VARCHAR(255) NOT NULL COMMENT '密码（bcrypt加密）',
    role ENUM('admin', 'developer', 'viewer') DEFAULT 'admin' COMMENT '角色',
    status TINYINT DEFAULT 1 COMMENT '1=启用 0=禁用',
    created_at DATETIME DEFAULT NOW(),
    updated_at DATETIME DEFAULT NOW() ON UPDATE NOW(),
    UNIQUE KEY uk_email (email),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
) COMMENT '用户表';

-- 3. 数据源表
CREATE TABLE IF NOT EXISTS datasources (
    id VARCHAR(32) PRIMARY KEY,
    tenant_id VARCHAR(32) NOT NULL COMMENT '所属租户',
    name VARCHAR(100) NOT NULL COMMENT '数据源名称',
    host VARCHAR(255) NOT NULL,
    port INT DEFAULT 3306,
    username VARCHAR(100) NOT NULL,
    password VARCHAR(255) NOT NULL COMMENT '加密存储',
    database_name VARCHAR(100) NOT NULL,
    status TINYINT DEFAULT 1,
    created_at DATETIME DEFAULT NOW(),
    updated_at DATETIME DEFAULT NOW() ON UPDATE NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
) COMMENT '数据源配置';

-- 4. API 分组表
CREATE TABLE IF NOT EXISTS api_groups (
    id VARCHAR(32) PRIMARY KEY,
    tenant_id VARCHAR(32) NOT NULL,
    name VARCHAR(100) NOT NULL COMMENT '分组名称',
    description VARCHAR(255) COMMENT '描述',
    sort_order INT DEFAULT 0 COMMENT '排序',
    created_at DATETIME DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
) COMMENT 'API分组';

-- 5. API 配置表
CREATE TABLE IF NOT EXISTS apis (
    id VARCHAR(32) PRIMARY KEY,
    tenant_id VARCHAR(32) NOT NULL,
    group_id VARCHAR(32) COMMENT '所属分组',
    name VARCHAR(100) NOT NULL COMMENT 'API名称',
    path VARCHAR(200) NOT NULL COMMENT '请求路径',
    method VARCHAR(10) DEFAULT 'POST' COMMENT 'HTTP方法',
    note VARCHAR(500) COMMENT '说明',
    content_type VARCHAR(100) DEFAULT 'application/json',
    params JSON COMMENT '参数定义',
    sql_config JSON COMMENT 'SQL配置',
    test_params JSON COMMENT '测试参数',
    status TINYINT DEFAULT 1,
    created_at DATETIME DEFAULT NOW(),
    updated_at DATETIME DEFAULT NOW() ON UPDATE NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (group_id) REFERENCES api_groups(id) ON DELETE SET NULL,
    UNIQUE KEY uk_tenant_path (tenant_id, path)
) COMMENT 'API配置';

-- 6. API 调用日志表
CREATE TABLE IF NOT EXISTS api_logs (
    id VARCHAR(32) PRIMARY KEY,
    api_id VARCHAR(32) NOT NULL,
    tenant_id VARCHAR(32),
    user_id VARCHAR(32),
    params JSON COMMENT '请求参数',
    success TINYINT NOT NULL COMMENT '1=成功 0=失败',
    duration_ms INT NOT NULL COMMENT '执行时长（毫秒）',
    error_message TEXT COMMENT '错误信息',
    ip_address VARCHAR(45),
    user_agent VARCHAR(500),
    created_at DATETIME DEFAULT NOW(),
    INDEX idx_api_id (api_id),
    INDEX idx_tenant_id (tenant_id),
    INDEX idx_created_at (created_at),
    FOREIGN KEY (api_id) REFERENCES apis(id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) COMMENT 'API调用日志';

-- 索引优化
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_datasources_tenant ON datasources(tenant_id);
CREATE INDEX IF NOT EXISTS idx_apis_tenant ON apis(tenant_id);
CREATE INDEX IF NOT EXISTS idx_apis_group ON apis(group_id);
CREATE INDEX IF NOT EXISTS idx_api_groups_tenant ON api_groups(tenant_id);

-- ================================================
-- 第三部分：创建系统租户
-- ================================================

INSERT INTO tenants (id, name, status, created_at)
VALUES ('SYSTEM', '系统', 1, NOW());

-- ================================================
-- 第四部分：创建"系统-用户管理" API分组
-- ================================================

INSERT INTO api_groups (id, tenant_id, name, description, sort_order, created_at)
VALUES (
    'SYSTEM_USER_MGMT',
    'SYSTEM',
    '系统-用户管理',
    '预置的用户和权限管理API，用于SaaS系统的用户认证和权限管理',
    0,
    NOW()
);

-- ================================================
-- 第五部分：预置10个权限管理API
-- ================================================

-- API 1: 获取用户列表
INSERT INTO apis (
    id, tenant_id, group_id, name, path, method, note,
    content_type, params, sql_config, test_params, status, created_at
) VALUES (
    'SYS_API_001',
    'SYSTEM',
    'SYSTEM_USER_MGMT',
    '获取用户列表',
    '/api/system/users/list',
    'POST',
    '查询租户下的所有用户列表，支持分页',
    'application/json',
    JSON_ARRAY(
        JSON_OBJECT('name', 'tenant_id', 'type', 'string', 'required', true, 'description', '租户ID'),
        JSON_OBJECT('name', 'page', 'type', 'number', 'required', false, 'description', '页码（默认1）'),
        JSON_OBJECT('name', 'page_size', 'type', 'number', 'required', false, 'description', '每页数量（默认20）')
    ),
    JSON_OBJECT(
        'datasource_id', 'PLATFORM',
        'sql', 'SELECT id, tenant_id, email, role, status, created_at, updated_at FROM users WHERE tenant_id = #{tenant_id} ORDER BY created_at DESC LIMIT 100'
    ),
    JSON_OBJECT('tenant_id', 'test-tenant-001', 'page', 1, 'page_size', 20),
    1,
    NOW()
);

-- API 2: 获取用户详情
INSERT INTO apis (
    id, tenant_id, group_id, name, path, method, note,
    content_type, params, sql_config, test_params, status, created_at
) VALUES (
    'SYS_API_002',
    'SYSTEM',
    'SYSTEM_USER_MGMT',
    '获取用户详情',
    '/api/system/users/detail',
    'POST',
    '根据用户ID获取用户详细信息',
    'application/json',
    JSON_ARRAY(
        JSON_OBJECT('name', 'user_id', 'type', 'string', 'required', true, 'description', '用户ID'),
        JSON_OBJECT('name', 'tenant_id', 'type', 'string', 'required', true, 'description', '租户ID')
    ),
    JSON_OBJECT(
        'datasource_id', 'PLATFORM',
        'sql', 'SELECT u.id, u.tenant_id, u.email, u.role, u.status, u.created_at, u.updated_at, t.name as tenant_name FROM users u LEFT JOIN tenants t ON u.tenant_id = t.id WHERE u.id = #{user_id} AND u.tenant_id = #{tenant_id}'
    ),
    JSON_OBJECT('user_id', 'test-user-001', 'tenant_id', 'test-tenant-001'),
    1,
    NOW()
);

-- API 3: 创建用户（SQL部分，实际创建需配合后端处理密码加密）
INSERT INTO apis (
    id, tenant_id, group_id, name, path, method, note,
    content_type, params, sql_config, test_params, status, created_at
) VALUES (
    'SYS_API_003',
    'SYSTEM',
    'SYSTEM_USER_MGMT',
    '检查邮箱是否存在',
    '/api/system/users/check_email',
    'POST',
    '创建用户前检查邮箱是否已被注册',
    'application/json',
    JSON_ARRAY(
        JSON_OBJECT('name', 'email', 'type', 'string', 'required', true, 'description', '邮箱地址')
    ),
    JSON_OBJECT(
        'datasource_id', 'PLATFORM',
        'sql', 'SELECT COUNT(*) as count FROM users WHERE email = #{email}'
    ),
    JSON_OBJECT('email', 'test@example.com'),
    1,
    NOW()
);

-- API 4: 更新用户状态
INSERT INTO apis (
    id, tenant_id, group_id, name, path, method, note,
    content_type, params, sql_config, test_params, status, created_at
) VALUES (
    'SYS_API_004',
    'SYSTEM',
    'SYSTEM_USER_MGMT',
    '更新用户状态',
    '/api/system/users/update_status',
    'POST',
    '启用或禁用用户账号',
    'application/json',
    JSON_ARRAY(
        JSON_OBJECT('name', 'user_id', 'type', 'string', 'required', true, 'description', '用户ID'),
        JSON_OBJECT('name', 'tenant_id', 'type', 'string', 'required', true, 'description', '租户ID'),
        JSON_OBJECT('name', 'status', 'type', 'number', 'required', true, 'description', '状态（1=启用，0=禁用）')
    ),
    JSON_OBJECT(
        'datasource_id', 'PLATFORM',
        'sql', 'UPDATE users SET status = #{status}, updated_at = NOW() WHERE id = #{user_id} AND tenant_id = #{tenant_id}'
    ),
    JSON_OBJECT('user_id', 'test-user-001', 'tenant_id', 'test-tenant-001', 'status', 1),
    1,
    NOW()
);

-- API 5: 更新用户角色
INSERT INTO apis (
    id, tenant_id, group_id, name, path, method, note,
    content_type, params, sql_config, test_params, status, created_at
) VALUES (
    'SYS_API_005',
    'SYSTEM',
    'SYSTEM_USER_MGMT',
    '更新用户角色',
    '/api/system/users/update_role',
    'POST',
    '修改用户的权限角色',
    'application/json',
    JSON_ARRAY(
        JSON_OBJECT('name', 'user_id', 'type', 'string', 'required', true, 'description', '用户ID'),
        JSON_OBJECT('name', 'tenant_id', 'type', 'string', 'required', true, 'description', '租户ID'),
        JSON_OBJECT('name', 'role', 'type', 'string', 'required', true, 'description', '角色（admin/developer/viewer）')
    ),
    JSON_OBJECT(
        'datasource_id', 'PLATFORM',
        'sql', 'UPDATE users SET role = #{role}, updated_at = NOW() WHERE id = #{user_id} AND tenant_id = #{tenant_id}'
    ),
    JSON_OBJECT('user_id', 'test-user-001', 'tenant_id', 'test-tenant-001', 'role', 'developer'),
    1,
    NOW()
);

-- API 6: 删除用户
INSERT INTO apis (
    id, tenant_id, group_id, name, path, method, note,
    content_type, params, sql_config, test_params, status, created_at
) VALUES (
    'SYS_API_006',
    'SYSTEM',
    'SYSTEM_USER_MGMT',
    '删除用户',
    '/api/system/users/delete',
    'POST',
    '删除用户账号（软删除，设置status=0）',
    'application/json',
    JSON_ARRAY(
        JSON_OBJECT('name', 'user_id', 'type', 'string', 'required', true, 'description', '用户ID'),
        JSON_OBJECT('name', 'tenant_id', 'type', 'string', 'required', true, 'description', '租户ID')
    ),
    JSON_OBJECT(
        'datasource_id', 'PLATFORM',
        'sql', 'UPDATE users SET status = 0, updated_at = NOW() WHERE id = #{user_id} AND tenant_id = #{tenant_id}'
    ),
    JSON_OBJECT('user_id', 'test-user-001', 'tenant_id', 'test-tenant-001'),
    1,
    NOW()
);

-- API 7: 获取租户信息
INSERT INTO apis (
    id, tenant_id, group_id, name, path, method, note,
    content_type, params, sql_config, test_params, status, created_at
) VALUES (
    'SYS_API_007',
    'SYSTEM',
    'SYSTEM_USER_MGMT',
    '获取租户信息',
    '/api/system/tenants/detail',
    'POST',
    '根据租户ID获取租户详细信息',
    'application/json',
    JSON_ARRAY(
        JSON_OBJECT('name', 'tenant_id', 'type', 'string', 'required', true, 'description', '租户ID')
    ),
    JSON_OBJECT(
        'datasource_id', 'PLATFORM',
        'sql', 'SELECT id, name, status, created_at, updated_at FROM tenants WHERE id = #{tenant_id}'
    ),
    JSON_OBJECT('tenant_id', 'test-tenant-001'),
    1,
    NOW()
);

-- API 8: 用户统计
INSERT INTO apis (
    id, tenant_id, group_id, name, path, method, note,
    content_type, params, sql_config, test_params, status, created_at
) VALUES (
    'SYS_API_008',
    'SYSTEM',
    'SYSTEM_USER_MGMT',
    '用户统计',
    '/api/system/users/stats',
    'POST',
    '获取租户下的用户统计信息',
    'application/json',
    JSON_ARRAY(
        JSON_OBJECT('name', 'tenant_id', 'type', 'string', 'required', true, 'description', '租户ID')
    ),
    JSON_OBJECT(
        'datasource_id', 'PLATFORM',
        'sql', 'SELECT COUNT(*) as total_users, SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) as active_users, SUM(CASE WHEN role = "admin" THEN 1 ELSE 0 END) as admin_count, SUM(CASE WHEN role = "developer" THEN 1 ELSE 0 END) as developer_count, SUM(CASE WHEN role = "viewer" THEN 1 ELSE 0 END) as viewer_count FROM users WHERE tenant_id = #{tenant_id}'
    ),
    JSON_OBJECT('tenant_id', 'test-tenant-001'),
    1,
    NOW()
);

-- API 9: 搜索用户
INSERT INTO apis (
    id, tenant_id, group_id, name, path, method, note,
    content_type, params, sql_config, test_params, status, created_at
) VALUES (
    'SYS_API_009',
    'SYSTEM',
    'SYSTEM_USER_MGMT',
    '搜索用户',
    '/api/system/users/search',
    'POST',
    '根据邮箱或角色搜索用户',
    'application/json',
    JSON_ARRAY(
        JSON_OBJECT('name', 'tenant_id', 'type', 'string', 'required', true, 'description', '租户ID'),
        JSON_OBJECT('name', 'keyword', 'type', 'string', 'required', false, 'description', '搜索关键词（邮箱）'),
        JSON_OBJECT('name', 'role', 'type', 'string', 'required', false, 'description', '角色筛选')
    ),
    JSON_OBJECT(
        'datasource_id', 'PLATFORM',
        'sql', 'SELECT id, tenant_id, email, role, status, created_at FROM users WHERE tenant_id = #{tenant_id} AND (email LIKE CONCAT("%", COALESCE(#{keyword}, ""), "%")) AND (role = #{role} OR #{role} IS NULL) ORDER BY created_at DESC LIMIT 50'
    ),
    JSON_OBJECT('tenant_id', 'test-tenant-001', 'keyword', 'admin', 'role', 'admin'),
    1,
    NOW()
);

-- API 10: 验证用户权限
INSERT INTO apis (
    id, tenant_id, group_id, name, path, method, note,
    content_type, params, sql_config, test_params, status, created_at
) VALUES (
    'SYS_API_010',
    'SYSTEM',
    'SYSTEM_USER_MGMT',
    '验证用户权限',
    '/api/system/users/verify_permission',
    'POST',
    '验证用户是否有指定权限（角色检查）',
    'application/json',
    JSON_ARRAY(
        JSON_OBJECT('name', 'user_id', 'type', 'string', 'required', true, 'description', '用户ID'),
        JSON_OBJECT('name', 'tenant_id', 'type', 'string', 'required', true, 'description', '租户ID'),
        JSON_OBJECT('name', 'required_role', 'type', 'string', 'required', true, 'description', '所需角色（admin/developer/viewer）')
    ),
    JSON_OBJECT(
        'datasource_id', 'PLATFORM',
        'sql', 'SELECT id, role, status, CASE WHEN status = 1 AND (role = #{required_role} OR role = "admin") THEN 1 ELSE 0 END as has_permission FROM users WHERE id = #{user_id} AND tenant_id = #{tenant_id}'
    ),
    JSON_OBJECT('user_id', 'test-user-001', 'tenant_id', 'test-tenant-001', 'required_role', 'developer'),
    1,
    NOW()
);

-- ================================================
-- 完成提示
-- ================================================

SELECT '✅ 数据库清理和初始化完成！' as message;
SELECT '系统租户ID: SYSTEM' as info;
SELECT CONCAT('预置API数量: ', COUNT(*), '个') as info FROM apis WHERE tenant_id = 'SYSTEM';
SELECT '认证API（7个）已在代码中实现，无需数据库配置' as note;
