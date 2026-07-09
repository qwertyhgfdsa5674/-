# 部署配置指南

## 服务器信息

- IP: 124.221.194.11
- OS: Ubuntu
- 部署路径: /opt/ai-ecommerce

## 第一步：生成 SSH 密钥

在本地执行：

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/ai-ecommerce-deploy
```

将公钥添加到服务器：

```bash
ssh-copy-id -i ~/.ssh/ai-ecommerce-deploy.pub root@124.221.194.11
```

## 第二步：GitHub Secrets（必需）

在仓库 Settings → Secrets and variables → Actions 中添加：

| Secret 名称        | 说明                                        | 示例                                    |
| ------------------ | ------------------------------------------- | --------------------------------------- |
| DEPLOY_SSH_KEY     | 私钥内容 (`cat ~/.ssh/ai-ecommerce-deploy`) | ed25519 private key                     |
| DEPLOY_HOST        | 服务器 IP                                   | 124.221.194.11                          |
| DEPLOY_USER        | SSH 用户名                                  | root                                    |
| DEPLOY_PATH        | 部署目录                                    | /opt/ai-ecommerce                       |
| DATABASE_URL       | PostgreSQL 连接串                           | postgresql://user:pass@postgres:5432/db |
| POSTGRES_PASSWORD  | 数据库密码                                  | 随机生成                                |
| FEISHU_WEBHOOK_URL | 飞书通知 webhook                            | https://open.feishu.cn/...              |

## 第三步：GitHub Variables（可选）

| Variable 名称 | 说明       | 默认值       |
| ------------- | ---------- | ------------ |
| HTTP_PORT     | HTTP 端口  | 80           |
| POSTGRES_USER | 数据库用户 | ai_ecommerce |
| POSTGRES_DB   | 数据库名   | ai_ecommerce |

## 第四步：API 凭证 Secrets（按需添加）

| Secret             | 用途           |
| ------------------ | -------------- |
| ALIBABA_APP_KEY    | 1688 开放平台  |
| ALIBABA_APP_SECRET | 1688 开放平台  |
| PDD_CLIENT_ID      | 拼多多开放平台 |
| PDD_CLIENT_SECRET  | 拼多多开放平台 |
| OPENAI_API_KEY     | AI 内容生成    |
| ANTHROPIC_API_KEY  | AI 内容生成    |

## 部署命令

首次部署：

```bash
git tag v0.1.0 && git push origin v0.1.0
```

手动部署（非 tag）：

在 GitHub Actions → Deploy → Run workflow 中选择环境触发。
