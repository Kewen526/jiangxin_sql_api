# HTTPS 配置指南

本指南说明如何为 Jiangxin SQL API 平台配置 HTTPS（SSL/TLS）。

## 方案选择

### 方案 1：Let's Encrypt 免费证书（推荐）

适用于：生产环境
优点：免费、自动续期、广泛信任
缺点：需要公网域名

### 方案 2：自签名证书

适用于：开发/测试环境
优点：快速配置、无需域名
缺点：浏览器会显示不安全警告

---

## 方案 1：Let's Encrypt 免费证书

### 前提条件

1. ✅ 有一个公网域名（例如：api.yourdomain.com）
2. ✅ DNS 已解析到服务器 IP
3. ✅ 服务器 80 和 443 端口开放

### 步骤 1：安装 Certbot

#### Ubuntu/Debian

```bash
sudo apt update
sudo apt install certbot python3-certbot-nginx
```

#### CentOS/RHEL

```bash
sudo yum install epel-release
sudo yum install certbot python3-certbot-nginx
```

### 步骤 2：申请证书

#### 方式 A：自动配置 Nginx（推荐）

```bash
# 替换 your-domain.com 为您的域名
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

Certbot 会自动：
- 申请证书
- 修改 Nginx 配置
- 设置 HTTPS 重定向

#### 方式 B：仅申请证书（手动配置）

```bash
sudo certbot certonly --nginx -d your-domain.com -d www.your-domain.com
```

证书位置：
- 完整链：`/etc/letsencrypt/live/your-domain.com/fullchain.pem`
- 私钥：`/etc/letsencrypt/live/your-domain.com/privkey.pem`

### 步骤 3：配置 Nginx

如果使用方式 B，需要手动配置 Nginx（已在 `nginx.conf` 中配置好）：

```bash
# 复制配置文件
sudo cp nginx.conf /etc/nginx/sites-available/jiangxin-sql-api

# 创建软链接
sudo ln -s /etc/nginx/sites-available/jiangxin-sql-api /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重启 Nginx
sudo systemctl restart nginx
```

### 步骤 4：配置自动续期

Let's Encrypt 证书有效期 90 天，需要自动续期。

#### 测试续期

```bash
sudo certbot renew --dry-run
```

#### 查看定时任务

```bash
# Ubuntu/Debian（systemd timer）
sudo systemctl status certbot.timer

# CentOS/RHEL（cron）
sudo cat /etc/cron.d/certbot
```

Certbot 会自动创建续期任务，无需手动配置。

### 步骤 5：验证 HTTPS

访问您的域名：
```
https://your-domain.com
```

检查证书：
```bash
curl -I https://your-domain.com
```

---

## 方案 2：自签名证书（开发/测试）

### 步骤 1：生成私钥和证书

```bash
# 创建证书目录
sudo mkdir -p /etc/ssl/jiangxin

# 生成私钥
sudo openssl genrsa -out /etc/ssl/jiangxin/server.key 2048

# 生成证书（有效期 365 天）
sudo openssl req -new -x509 -key /etc/ssl/jiangxin/server.key \
  -out /etc/ssl/jiangxin/server.crt -days 365

# 输入证书信息
# Country Name (2 letter code): CN
# State or Province Name: Beijing
# Locality Name: Beijing
# Organization Name: Your Company
# Organizational Unit Name: IT
# Common Name: localhost (或您的域名/IP)
# Email Address: admin@example.com
```

### 步骤 2：修改 Nginx 配置

编辑 `nginx.conf`，修改 SSL 证书路径：

```nginx
ssl_certificate /etc/ssl/jiangxin/server.crt;
ssl_certificate_key /etc/ssl/jiangxin/server.key;
```

### 步骤 3：重启 Nginx

```bash
sudo nginx -t
sudo systemctl restart nginx
```

### 步骤 4：信任自签名证书

浏览器会显示警告，需要手动信任：

- Chrome/Edge：点击 "高级" → "继续前往"
- Firefox：点击 "高级" → "接受风险并继续"

**生产环境不要使用自签名证书！**

---

## 常见问题

### 1. 证书续期失败

```bash
# 查看日志
sudo cat /var/log/letsencrypt/letsencrypt.log

# 手动续期
sudo certbot renew --force-renewal
```

### 2. Nginx 配置错误

```bash
# 测试配置
sudo nginx -t

# 查看错误日志
sudo tail -f /var/log/nginx/error.log
```

### 3. 端口被占用

```bash
# 检查端口占用
sudo netstat -tulpn | grep :80
sudo netstat -tulpn | grep :443

# 停止其他服务
sudo systemctl stop apache2  # 如果安装了 Apache
```

### 4. 防火墙配置

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

## 安全建议

### 1. 启用 HSTS

已在 `nginx.conf` 中配置：
```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

### 2. 配置强密码套件

已在 `nginx.conf` 中配置最佳实践密码套件。

### 3. 定期更新

```bash
# 更新 Nginx
sudo apt update && sudo apt upgrade nginx  # Ubuntu/Debian
sudo yum update nginx  # CentOS/RHEL

# 更新 Certbot
sudo apt update && sudo apt upgrade certbot  # Ubuntu/Debian
sudo yum update certbot  # CentOS/RHEL
```

### 4. 监控证书过期

```bash
# 查看证书过期时间
sudo certbot certificates
```

### 5. 备份证书

```bash
sudo cp -r /etc/letsencrypt /backup/letsencrypt-$(date +%Y%m%d)
```

---

## SSL 测试工具

配置完成后，使用以下工具测试：

1. **SSL Labs**：https://www.ssllabs.com/ssltest/
   - 评分 A+ 为最佳

2. **命令行测试**：
```bash
# 检查证书信息
openssl s_client -connect your-domain.com:443 -servername your-domain.com

# 检查证书过期时间
echo | openssl s_client -connect your-domain.com:443 2>/dev/null | openssl x509 -noout -dates
```

---

## 完成检查清单

- [ ] 域名 DNS 已解析
- [ ] Certbot 已安装
- [ ] SSL 证书已申请
- [ ] Nginx 配置已更新
- [ ] HTTPS 可正常访问
- [ ] HTTP 自动重定向到 HTTPS
- [ ] 证书自动续期已配置
- [ ] 防火墙已开放 80/443 端口

---

## 参考资源

- Let's Encrypt 官网：https://letsencrypt.org/
- Certbot 文档：https://certbot.eff.org/
- Nginx SSL 配置：https://nginx.org/en/docs/http/configuring_https_servers.html
- Mozilla SSL 配置生成器：https://ssl-config.mozilla.org/
