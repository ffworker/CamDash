# Kiosk Setup (Debian 13 + GNOME)

Goal: auto-login into GNOME and launch Firefox in kiosk mode on boot.
This version is filled in for user `logserv` and URL `http://172.17.1.56:8080/`.

1) Install the needed packages (skip anything you already have):
```bash
sudo apt update
sudo apt install gdm3 gnome-session gnome-shell firefox-esr
```

Optional check:
```bash
firefox --version || firefox-esr --version
```

2) Create the kiosk user (`logserv`):
```bash
sudo adduser logserv
```

3) Enable GDM auto-login (`/etc/gdm3/daemon.conf`):
```ini
[daemon]
AutomaticLoginEnable=true
AutomaticLogin=logserv
DefaultSession=gnome
```

Notes:
- If you want to avoid focus issues, you can force Xorg:
```ini
WaylandEnable=false
DefaultSession=gnome-xorg
```

4) Create required user directories (run as `logserv` user, not root):
```bash
mkdir -p /home/logserv/.local/bin
mkdir -p /home/logserv/.config/autostart
```

5) Kiosk startup script:

File:
```bash
/home/logserv/.local/bin/kiosk.sh
```

Content:
```bash
#!/usr/bin/env bash
set -e

sleep 8

gsettings set org.gnome.desktop.screensaver lock-enabled false
gsettings set org.gnome.desktop.session idle-delay 0
gsettings set org.gnome.mutter dynamic-workspaces false
gsettings set org.gnome.desktop.wm.preferences num-workspaces 1

/usr/bin/firefox --kiosk --mute-audio http://172.17.1.56:8080/ &
sleep 2

# If Firefox starts in the background (Xorg only), try to focus it.
if command -v wmctrl >/dev/null 2>&1; then
  wmctrl -xa firefox || wmctrl -a "Firefox" || true
fi

wait
```

6) Make it executable:
```bash
chmod +x /home/logserv/.local/bin/kiosk.sh
```

7) GNOME autostart entry:

File:
```bash
/home/logserv/.config/autostart/camdash-kiosk.desktop
```

Content:
```ini
[Desktop Entry]
Type=Application
Name=CamDash Kiosk
Exec=/bin/bash /home/logserv/.local/bin/kiosk.sh
Terminal=false
X-GNOME-Autostart-enabled=true
X-GNOME-Autostart-Delay=10
```

8) (Optional) Install wmctrl if you forced Xorg and need focus control:
```bash
sudo apt install wmctrl
```

9) Reboot:
```bash
sudo reboot
```

After boot, GNOME should auto-login into the kiosk user and Firefox should open fullscreen in kiosk mode.
If you still see a dock/taskbar, make sure you are using the plain "GNOME" session (not "GNOME Classic").
