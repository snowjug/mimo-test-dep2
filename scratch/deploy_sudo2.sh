echo 'printpi' | sudo -S sh -c "echo 'pi ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart ipp-usb, /usr/sbin/cupsenable' > /etc/sudoers.d/mimo-watchdog"
echo 'printpi' | sudo -S chmod 0440 /etc/sudoers.d/mimo-watchdog
echo 'printpi' | sudo -S systemctl restart mimo-listener
