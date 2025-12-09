# 🚀 SQL API 平台 - 清理和部署步骤

## 📋 部署清单

### ✅ 已完成的准备工作

1. **环境配置文件** - `.env` 已创建
2. **数据库脚本** - `database_cleanup_and_init.sql` 已创建
3. **前端配置** - `admin.html` 已更新（删除旧地址）
4. **后端代码** - JWT认证、PLATFORM数据源支持已就绪

---

## 🔧 待执行步骤

### 步骤 1: 配置环境变量

编辑 `.env` 文件，修改以下配置：

```bash
# 必须修改的配置
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production  # 改为强密码
PLATFORM_DB_PASSWORD=your_database_password  # 改为实际数据库密码

# 可选修改的配置
PLATFORM_DB_HOST=localhost  # 如果数据库在远程服务器，修改为实际地址
```

### 步骤 2: 初始化数据库

执行数据库清理和初始化脚本：

```bash
# 方式1：使用 MySQL 命令行（需要输入密码）
mysql -h localhost -u root -p < database_cleanup_and_init.sql

# 方式2：直接指定数据库和密码
mysql -h localhost -u root -p你的密码 < database_cleanup_and_init.sql

# 方式3：进入 MySQL 后执行
mysql -h localhost -u root -p
> source database_cleanup_and_init.sql
```

**此脚本将会：**
- ✅ 清空所有旧数据（apis, api_groups, datasources, users, tenants）
- ✅ 创建新的表结构
- ✅ 插入系统租户（SYSTEM）
- ✅ 插入10个预置权限管理API

### 步骤 3: 安装依赖（如果还没安装）

```bash
npm install
```

### 步骤 4: 启动服务

```bash
# 开发模式（热重载）
npm run dev

# 生产模式
npm start

# 或使用 PM2（推荐生产环境）
npm run pm2:start
```

### 步骤 5: 验证部署

#### 5.1 检查服务状态

访问健康检查端点：
```
https://kewenai.asia/health
```

应该返回：
```json
{
  "status": "ok",
  "timestamp": "..."
}
```

#### 5.2 检查管理后台

访问管理后台：
```
https://kewenai.asia/admin
```

应该能看到：
- **系统-用户管理** 分组
- **10个预置API**（获取用户列表、获取用户详情等）

#### 5.3 测试认证API

**测试注册接口：**
```bash
curl -X POST https://kewenai.asia/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "company": "测试公司",
    "email": "test@example.com",
    "password": "test123456"
  }'
```

应该返回：
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1...",
    "user": {
      "id": "u_...",
      "email": "test@example.com",
      "role": "admin",
      "tenant": {
        "id": "t_...",
        "name": "测试公司"
      }
    }
  }
}
```

**测试登录接口：**
```bash
curl -X POST https://kewenai.asia/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "test123456"
  }'
```

#### 5.4 测试预置的权限管理API

```bash
# 获取用户列表（需要提供 tenant_id）
curl -X POST https://kewenai.asia/api/system/users/list \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "t_你注册时生成的租户ID"
  }'
```

---

## 🎉 部署完成

完成以上步骤后，你的 SQL API 平台已经准备就绪！

### 已预置的功能

1. **7个认证API**（代码实现，无需配置）
   - POST `/api/auth/register` - 用户注册
   - POST `/api/auth/login` - 用户登录
   - GET `/api/auth/me` - 获取当前用户信息
   - POST `/api/auth/refresh` - 刷新Token
   - POST `/api/auth/logout` - 退出登录
   - Token有效期：**7天**

2. **10个权限管理API**（数据库配置，可在管理后台查看/编辑）
   - `/api/system/users/list` - 获取用户列表
   - `/api/system/users/detail` - 获取用户详情
   - `/api/system/users/check_email` - 检查邮箱是否存在
   - `/api/system/users/update_status` - 更新用户状态
   - `/api/system/users/update_role` - 更新用户角色
   - `/api/system/users/delete` - 删除用户
   - `/api/system/tenants/detail` - 获取租户信息
   - `/api/system/users/stats` - 用户统计
   - `/api/system/users/search` - 搜索用户
   - `/api/system/users/verify_permission` - 验证用户权限

### 下一步

- 访问 `https://kewenai.asia/admin` 创建你的业务API
- 所有API都支持使用 `PLATFORM` 数据源（访问平台数据库）
- 管理后台无需登录即可使用（仅你个人使用）

---

## ❗ 常见问题

### 1. 数据库连接失败

检查 `.env` 文件中的数据库配置是否正确：
- `PLATFORM_DB_HOST`
- `PLATFORM_DB_PORT`
- `PLATFORM_DB_USER`
- `PLATFORM_DB_PASSWORD`
- `PLATFORM_DB_DATABASE`

### 2. 前端显示 500 错误

可能原因：
1. 后端服务未启动（检查端口3000）
2. 数据库连接失败（查看服务日志）
3. 数据库未初始化（执行SQL脚本）

查看日志：
```bash
# 如果使用 PM2
pm2 logs

# 如果直接运行
# 查看终端输出
```

### 3. Nginx 配置

当前配置只允许域名访问：
- ✅ `https://kewenai.asia`
- ❌ `http://8.146.210.145`（已删除IP访问）

如需修改，编辑 `/etc/nginx/sites-available/jiangxin-sql-api`
