echo "printpi ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart ipp-usb, /usr/sbin/cupsenable" | sudo tee /etc/sudoers.d/mimo-watchdog
sudo chmod 0440 /etc/sudoers.d/mimo-watchdog
sudo systemctl restart mimo-listener
