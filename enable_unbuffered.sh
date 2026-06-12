sudo sed -i '/Environment="PRINTER_NAME/i Environment="PYTHONUNBUFFERED=1"' /etc/systemd/system/mimo-listener.service
sudo systemctl daemon-reload
sudo systemctl restart mimo-listener.service
