#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# ODB Sanctions Service — VPS Setup Script
# Запускати на VPS: bash setup-sanctions-vps.sh
# ═══════════════════════════════════════════════════════════════
set -e

echo "═══════════════════════════════════════"
echo "  ODB Sanctions Service Setup"
echo "  OpenSanctions bulk data (OFAC, EU, UN...)"
echo "═══════════════════════════════════════"

# ─── Директорії ───────────────────────────────────────────────
mkdir -p /opt/odb
mkdir -p /data/sanctions

# ─── Python залежності ────────────────────────────────────────
echo "[1/4] Installing Python dependencies..."
pip3 install aiohttp --quiet

# ─── Копіюємо сервіс ──────────────────────────────────────────
echo "[2/4] Deploying sanctions_service.py..."
# (файл вже має бути скопійований через scp або git pull)
if [ ! -f /opt/odb/sanctions_service.py ]; then
    echo "ERROR: /opt/odb/sanctions_service.py not found"
    echo "Run: scp scripts/sanctions_service.py root@161.35.86.145:/opt/odb/"
    exit 1
fi

# ─── Systemd сервіс ───────────────────────────────────────────
echo "[3/4] Installing systemd service..."
cat > /etc/systemd/system/odb-sanctions.service << 'EOF'
[Unit]
Description=ODB Sanctions Service (OpenSanctions bulk data)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/odb
ExecStart=/usr/bin/python3 /opt/odb/sanctions_service.py
Restart=always
RestartSec=10
Environment=SANCTIONS_PORT=8010
Environment=SANCTIONS_DATA_DIR=/data/sanctions
StandardOutput=journal
StandardError=journal
SyslogIdentifier=odb-sanctions

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable odb-sanctions
systemctl restart odb-sanctions

# ─── Перевірка ────────────────────────────────────────────────
echo "[4/4] Checking service..."
sleep 3

if systemctl is-active --quiet odb-sanctions; then
    echo "✅ Service started!"
    echo ""
    echo "⏳ First run: downloading ~300MB OpenSanctions dataset..."
    echo "   This will take 5-15 min depending on VPS bandwidth."
    echo ""
    echo "Monitor progress:"
    echo "  journalctl -u odb-sanctions -f"
    echo ""
    echo "Check when ready:"
    echo "  curl http://localhost:8010/health"
    echo ""
else
    echo "❌ Service failed to start!"
    journalctl -u odb-sanctions -n 20
    exit 1
fi

# ─── Firewall (якщо є ufw) ────────────────────────────────────
if command -v ufw &> /dev/null; then
    echo "Note: If port 8010 is blocked, run:"
    echo "  ufw allow 8010/tcp"
fi

echo ""
echo "═══════════════════════════════════════"
echo "  Setup complete! Port: 8010"
echo "═══════════════════════════════════════"
