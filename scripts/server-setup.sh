#!/usr/bin/env bash
set -euo pipefail

echo "=== Installing Docker ==="
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable docker --now
sudo usermod -aG docker "$USER"

echo "=== Installing Node.js 22 ==="
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

echo "=== Enabling firewall ==="
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

echo "=== Creating deploy directory ==="
sudo mkdir -p /opt/ai-ecommerce
sudo chown "$USER":"$USER" /opt/ai-ecommerce

echo "=== Done ==="
echo "Next steps:"
echo "1. Log out and log back in for Docker group to take effect"
echo "2. Add GitHub Secrets: DEPLOY_SSH_KEY, DEPLOY_HOST, DEPLOY_USER, DEPLOY_PATH"
docker --version && echo "Docker OK" || echo "Docker needs relogin"
node --version && echo "Node OK"
