# Quick Starter (Kiosk)

This file is a placeholder for step‑by‑step kiosk instructions.

## Debian 12 + GNOME (GDM) – Firefox Kiosk (Placeholder URL)
Goal: GNOME autologin starts a kiosk user and launches Firefox in kiosk mode.

1) Install packages:
```bash
sudo apt update
sudo apt install firefox-esr gdm3
```

2) Create kiosk user (example: `kiosk`):
```bash
sudo useradd -m -s /bin/bash kiosk
sudo passwd kiosk
```

3) Enable GDM autologin (`/etc/gdm3/daemon.conf`):
```ini
[daemon]
AutomaticLoginEnable=true
AutomaticLogin=kiosk
```

4) Autostart Firefox kiosk (`/home/kiosk/.config/autostart/camdash-kiosk.desktop`):
```ini
[Desktop Entry]
Type=Application
Name=CamDash Kiosk
Exec=firefox --kiosk "http://<HOST>:8080/"
X-GNOME-Autostart-enabled=true
```

5) Disable lock/blanking (run as `kiosk`):
```bash
gsettings set org.gnome.desktop.screensaver lock-enabled false
gsettings set org.gnome.desktop.session idle-delay 0
gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type 'nothing'
gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-battery-type 'nothing'
```

6) Reboot:
```bash
sudo reboot
```

Replace the URL placeholder with your CamDash address.
