# Jiangxin SQL API 平台 - 完整部署指南

## 📋 服务器信息

- **服务器IP**: 8.146.210.145
- **域名**: kewenai.asia
- **数据库**: MySQL 5.7+ (同服务器)
- **Node.js**: 18.x+ (推荐 LTS 版本)
- **操作系统**: Linux (Ubuntu 20.04+ / CentOS 7+)

---

## 🚀 快速部署步骤

### 步骤 1：服务器环境准备

#### 1.1 安装 Node.js 18+

```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# CentOS/RHEL
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# 验证安装
node --version  # 应该显示 v18.x.x
npm --version
```

#### 1.2 安装 Git

```bash
# Ubuntu/Debian
sudo apt update && sudo apt install git -y

# CentOS/RHEL
sudo yum install git -y
```

#### 1.3 安装 PM2（进程管理器）

```bash
sudo npm install -g pm2

# 设置开机自启
pm2 startup
# 按照提示执行命令
```

#### 1.4 安装 Nginx

```bash
# Ubuntu/Debian
sudo apt update && sudo apt install nginx -y

# CentOS/RHEL
sudo yum install nginx -y

# 启动 Nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

---

### 步骤 2：数据库初始化

#### 2.1 连接到 MySQL

```bash
mysql -h 8.146.210.145 -u root -p
# 输入密码: Kewen888@
```

#### 2.2 执行初始化脚本

方式 A：直接在服务器上执行
```bash
cd /path/to/jiangxin_sql_api/Kewen_sql_api-main
mysql -h 8.146.210.145 -u root -p < database_init.sql
```

方式 B：从 MySQL 客户端执行
```bash
mysql -h 8.146.210.145 -u root -p
mysql> source /path/to/database_init.sql;
```

#### 2.3 验证初始化结果

```sql
USE sql_api_platform;

-- 检查表是否创建成功
SHOW TABLES;

-- 检查系统租户
SELECT * FROM tenants WHERE id = 'SYSTEM';

-- 检查预置API数量
SELECT COUNT(*) FROM apis WHERE tenant_id = 'SYSTEM';
```

预期结果：
- ✅ 7张表（tenants, users, datasources, api_groups, apis, api_logs）
- ✅ 1个系统租户
- ✅ 10个预置用户管理API

---

### 步骤 3：部署应用代码

#### 3.1 克隆或上传代码

```bash
# 方式 A：从 Git 克隆
cd /opt
git clone <your-repository-url> jiangxin_sql_api
cd jiangxin_sql_api/Kewen_sql_api-main

# 方式 B：上传代码包
# 使用 scp 或 FTP 上传代码到服务器
```

#### 3.2 安装依赖

```bash
cd /opt/jiangxin_sql_api/Kewen_sql_api-main
npm install --production
```

#### 3.3 配置环境变量

检查 `.env` 文件：

```bash
cat .env
```

确保配置正确：
```env
PORT=3000
HOST=0.0.0.0
NODE_ENV=production

PLATFORM_DB_HOST=8.146.210.145
PLATFORM_DB_PORT=3306
PLATFORM_DB_USER=root
PLATFORM_DB_PASSWORD=Kewen888@
PLATFORM_DB_DATABASE=sql_api_platform

JWT_SECRET=jiangxin-sql-api-secret-key-2024-change-in-production
JWT_EXPIRES_IN=7d
```

⚠️ **重要**：生产环境务必修改 `JWT_SECRET`！

```bash
# 生成新的随机密钥
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# 复制生成的密钥，替换 .env 中的 JWT_SECRET
```

#### 3.4 测试启动

```bash
npm start
```

如果看到以下输出，说明启动成功：
```
✅ 平台数据库连接成功
✅ 认证系统已加载
✅ API管理路由已加载
🎉 成功注册 10 个动态API路由
🚀 服务器运行在: http://0.0.0.0:3000
```

测试健康检查：
```bash
curl http://localhost:3000/health
# 应返回: {"status":"ok","timestamp":"..."}
```

按 `Ctrl+C` 停止测试。

---

### 步骤 4：使用 PM2 部署

#### 4.1 启动应用

```bash
cd /opt/jiangxin_sql_api/Kewen_sql_api-main

# 启动应用
pm2 start src/server.js --name jiangxin-sql-api

# 保存 PM2 配置
pm2 save
```

#### 4.2 查看运行状态

```bash
# 查看进程列表
pm2 list

# 查看日志
pm2 logs jiangxin-sql-api

# 查看详细信息
pm2 show jiangxin-sql-api
```

#### 4.3 常用 PM2 命令

```bash
# 重启应用
pm2 restart jiangxin-sql-api

# 停止应用
pm2 stop jiangxin-sql-api

# 删除应用
pm2 delete jiangxin-sql-api

# 查看实时日志
pm2 logs jiangxin-sql-api --lines 100
```

---

### 步骤 5：配置 Nginx 反向代理

#### 5.1 复制配置文件

```bash
cd /opt/jiangxin_sql_api/Kewen_sql_api-main

# 复制 Nginx 配置
sudo cp nginx.conf /etc/nginx/sites-available/jiangxin-sql-api

# 创建软链接（Ubuntu/Debian）
sudo ln -s /etc/nginx/sites-available/jiangxin-sql-api /etc/nginx/sites-enabled/

# CentOS/RHEL 用户
# sudo cp nginx.conf /etc/nginx/conf.d/jiangxin-sql-api.conf
```

#### 5.2 测试 Nginx 配置

```bash
sudo nginx -t
```

如果显示 `syntax is ok` 和 `test is successful`，继续下一步。

#### 5.3 重启 Nginx

```bash
sudo systemctl restart nginx
```

#### 5.4 配置防火墙

```bash
# Ubuntu/Debian (ufw)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw reload

# CentOS/RHEL (firewalld)
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

---

### 步骤 6：配置 HTTPS（Let's Encrypt）

#### 6.1 确保 DNS 已解析

```bash
# 检查域名解析
nslookup kewenai.asia
ping kewenai.asia
```

确保域名解析到 `8.146.210.145`。

#### 6.2 安装 Certbot

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install certbot python3-certbot-nginx -y

# CentOS/RHEL
sudo yum install epel-release -y
sudo yum install certbot python3-certbot-nginx -y
```

#### 6.3 申请 SSL 证书

```bash
# 自动配置（推荐）
sudo certbot --nginx -d kewenai.asia -d www.kewenai.asia

# 按照提示操作：
# 1. 输入邮箱地址
# 2. 同意服务条款 (Y)
# 3. 是否接收邮件 (N/Y)
# 4. 选择是否强制 HTTPS 重定向 (2 - 推荐)
```

#### 6.4 验证 HTTPS

```bash
# 访问测试
curl -I https://kewenai.asia/health

# 检查证书
echo | openssl s_client -connect kewenai.asia:443 2>/dev/null | openssl x509 -noout -dates
```

#### 6.5 配置自动续期

```bash
# 测试续期
sudo certbot renew --dry-run

# 查看续期定时任务
sudo systemctl status certbot.timer
```

Certbot 会自动创建续期任务，无需手动配置。

---

### 步骤 7：验证部署

#### 7.1 健康检查

```bash
curl https://kewenai.asia/health
# 应返回: {"status":"ok","timestamp":"..."}
```

#### 7.2 访问管理界面

打开浏览器访问：
- 注册页面：https://kewenai.asia/register.html
- 登录页面：https://kewenai.asia/login.html
- 管理界面：https://kewenai.asia/admin_v2.html
- API文档：https://kewenai.asia/api_docs.html

#### 7.3 测试系统管理员登录

默认管理员账号：
- 邮箱：admin@jiangxin.com
- 密码：admin123

⚠️ **重要**：首次登录后立即修改密码！

#### 7.4 测试预置API

```bash
# 获取用户列表（需要先注册/登录获取 token）
curl -X POST https://kewenai.asia/api/system/users/list \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "tenant_id": "YOUR_TENANT_ID",
    "page": 1,
    "page_size": 20
  }'
```

---

## 🔧 高级配置

### 监控和日志

#### PM2 监控

```bash
# 实时监控
pm2 monit

# 查看资源使用
pm2 status
```

#### Nginx 日志

```bash
# 访问日志
sudo tail -f /var/log/nginx/jiangxin_sql_api_access.log

# 错误日志
sudo tail -f /var/log/nginx/jiangxin_sql_api_error.log
```

#### 应用日志

```bash
# PM2 日志
pm2 logs jiangxin-sql-api

# 日志文件位置
ls ~/.pm2/logs/
```

### 性能优化

#### PM2 集群模式

```bash
# 停止当前实例
pm2 delete jiangxin-sql-api

# 启动集群模式（根据 CPU 核心数）
pm2 start src/server.js --name jiangxin-sql-api -i max

# 保存配置
pm2 save
```

#### Nginx 缓存配置

编辑 `/etc/nginx/sites-available/jiangxin-sql-api`，在 server 块中添加：

```nginx
# 缓存配置
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=api_cache:10m max_size=100m inactive=60m;

location /api/static/ {
    proxy_cache api_cache;
    proxy_cache_valid 200 10m;
    proxy_pass http://localhost:3000;
}
```

### 备份策略

#### 数据库备份

```bash
#!/bin/bash
# /opt/scripts/backup_db.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/opt/backups/mysql"
mkdir -p $BACKUP_DIR

mysqldump -h 8.146.210.145 -u root -p'Kewen888@' sql_api_platform \
  > $BACKUP_DIR/sql_api_platform_$DATE.sql

# 保留最近7天的备份
find $BACKUP_DIR -name "*.sql" -mtime +7 -delete

echo "备份完成: $BACKUP_DIR/sql_api_platform_$DATE.sql"
```

添加定时任务：
```bash
# 每天凌晨2点备份
crontab -e
# 添加: 0 2 * * * /opt/scripts/backup_db.sh
```

#### 代码备份

```bash
#!/bin/bash
# /opt/scripts/backup_code.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/opt/backups/code"
mkdir -p $BACKUP_DIR

tar -czf $BACKUP_DIR/jiangxin_sql_api_$DATE.tar.gz \
  /opt/jiangxin_sql_api/Kewen_sql_api-main \
  --exclude=node_modules \
  --exclude=.git

# 保留最近30天的备份
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete

echo "代码备份完成: $BACKUP_DIR/jiangxin_sql_api_$DATE.tar.gz"
```

---

## 🛠 故障排查

### 应用无法启动

```bash
# 检查 PM2 日志
pm2 logs jiangxin-sql-api --err

# 检查端口占用
netstat -tulpn | grep :3000

# 检查数据库连接
mysql -h 8.146.210.145 -u root -p
```

### Nginx 502 错误

```bash
# 检查应用是否运行
pm2 status

# 检查 Nginx 错误日志
sudo tail -f /var/log/nginx/error.log

# 重启服务
pm2 restart jiangxin-sql-api
sudo systemctl restart nginx
```

### SSL 证书问题

```bash
# 查看证书状态
sudo certbot certificates

# 手动续期
sudo certbot renew --force-renewal

# 重启 Nginx
sudo systemctl restart nginx
```

### 数据库连接失败

```bash
# 检查数据库服务
mysql -h 8.146.210.145 -u root -p -e "SELECT 1"

# 检查防火墙
sudo iptables -L -n | grep 3306

# 检查 .env 配置
cat /opt/jiangxin_sql_api/Kewen_sql_api-main/.env
```

---

## 📝 维护清单

### 每日检查
- [ ] 查看 PM2 进程状态：`pm2 status`
- [ ] 查看应用日志：`pm2 logs --lines 50`
- [ ] 查看 Nginx 错误日志

### 每周检查
- [ ] 检查磁盘空间：`df -h`
- [ ] 检查数据库大小
- [ ] 清理旧日志：`pm2 flush`

### 每月检查
- [ ] 更新系统包：`sudo apt update && sudo apt upgrade`
- [ ] 检查 SSL 证书有效期：`sudo certbot certificates`
- [ ] 审查 API 调用日志和统计
- [ ] 检查备份是否正常

---

## 🔐 安全建议

### 1. 修改默认密码

```bash
# 修改系统管理员密码
# 登录后台 -> 用户管理 -> 修改密码
```

### 2. 修改 JWT 密钥

```bash
# 生成新密钥
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 更新 .env
vim /opt/jiangxin_sql_api/Kewen_sql_api-main/.env
# 修改 JWT_SECRET

# 重启应用
pm2 restart jiangxin-sql-api
```

### 3. 配置防火墙

```bash
# 只开放必要端口
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 4. 启用访问限制

在 Nginx 配置中添加 IP 白名单（如果需要）：

```nginx
location /admin {
    allow your.trusted.ip;
    deny all;
    proxy_pass http://localhost:3000;
}
```

### 5. 定期更新

```bash
# 更新 Node.js 依赖
cd /opt/jiangxin_sql_api/Kewen_sql_api-main
npm audit
npm update

# 重启应用
pm2 restart jiangxin-sql-api
```

---

## 📞 支持和联系

如有问题，请检查：
1. 应用日志：`pm2 logs jiangxin-sql-api`
2. Nginx 日志：`/var/log/nginx/jiangxin_sql_api_error.log`
3. 数据库日志：`/var/log/mysql/error.log`

---

## 🎉 部署完成

恭喜！Jiangxin SQL API 平台已成功部署。

访问地址：
- 🌐 主页：https://kewenai.asia
- 📝 注册：https://kewenai.asia/register.html
- 🔐 登录：https://kewenai.asia/login.html
- ⚙️  管理：https://kewenai.asia/admin_v2.html
- 📚 文档：https://kewenai.asia/api_docs.html

默认管理员：
- 📧 邮箱：admin@jiangxin.com
- 🔑 密码：admin123（请立即修改）

预置功能：
- ✅ JWT 认证系统
- ✅ 多租户隔离
- ✅ 10个用户管理API
- ✅ 动态SQL转API
- ✅ API调用日志
- ✅ 自动API文档
- ✅ HTTPS加密

开始使用吧！ 🚀
