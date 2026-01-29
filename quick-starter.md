# Quick Starter (Kiosk)

Short, single-page setup for Debian 12 + GNOME (GDM). For full details, see `kiosk-setup.md`.

## Debian 12 + GNOME (GDM) - Firefox Kiosk
Goal: GNOME autologin starts a kiosk user and launches Firefox in kiosk mode.

1) Install packages (skip if Firefox is already installed):
```bash
sudo apt update
sudo apt install firefox-esr gdm3
```

2) Create the kiosk user (skip if it already exists):
```bash
sudo adduser --disabled-password --gecos "" logserv
```

3) Enable GDM autologin (`/etc/gdm3/daemon.conf`):
```ini
[daemon]
AutomaticLoginEnabled=true
AutomaticLogin=logserv
```

4) Create required user directories (run as user `logserv`, not root):
```bash
mkdir -p /home/logserv/.local/bin
mkdir -p /home/logserv/.config/autostart
```

5) Create the kiosk startup script at `/home/logserv/.local/bin/kiosk.sh`:
```bash
#!/bin/bash

sleep 8

gsettings set org.gnome.desktop.screensaver lock-enabled false
gsettings set org.gnome.desktop.session idle-delay 0
gsettings set org.gnome.mutter dynamic-workspaces false
gsettings set org.gnome.desktop.wm.preferences num-workspaces 1

firefox --kiosk --mute-audio http://<host>:8080/
```

6) Make it executable:
```bash
chmod +x /home/logserv/.local/bin/kiosk.sh
```

7) GNOME autostart entry (critical) at `/home/logserv/.config/autostart/camdash-kiosk.desktop`:
```ini
[Desktop Entry]
Type=Application
Name=CamDash Kiosk
Exec=/bin/bash /home/logserv/.local/bin/kiosk.sh
Terminal=false
X-GNOME-Autostart-enabled=true
```

8) Reboot:
```bash
sudo reboot
```

Replace the URL placeholder with your CamDash address.
