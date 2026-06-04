#!/bin/bash
# Розгортання VK проксі на VPS
# Запуск: bash deploy_vk_proxy.sh ВАШ_VK_TOKEN

VK_TOKEN="${1:-}"
if [ -z "$VK_TOKEN" ]; then
  echo "Використання: bash deploy_vk_proxy.sh ВАШ_VK_TOKEN"
  exit 1
fi

echo "[1/5] Встановлення залежностей..."
pip3 install flask requests 2>/dev/null || pip install flask requests

echo "[2/5] Копіювання vk_proxy.py..."
mkdir -p /opt/vk-proxy
cp vk_proxy.py /opt/vk-proxy/vk_proxy.py

echo "[3/5] Створення systemd сервісу..."
cat > /etc/systemd/system/vk-proxy.service << EOF
[Unit]
Description=VK API Proxy
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/vk-proxy
Environment="VK_TOKEN=${VK_TOKEN}"
Environment="PORT=8008"
ExecStart=/usr/bin/python3 /opt/vk-proxy/vk_proxy.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

echo "[4/5] Запуск сервісу..."
systemctl daemon-reload
systemctl enable vk-proxy
systemctl restart vk-proxy

echo "[5/5] Перевірка..."
sleep 2
curl -s http://localhost:8008/vk/health

echo ""
echo "✅ VK проксі запущено на порту 8008"
echo "   Перевірка: curl http://161.35.86.145:8008/vk/health"
