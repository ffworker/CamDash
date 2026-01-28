# Kiosk Setup

## 1 Create the autostart folder

```bash
mkdir -p /home/logserv/.config/autostart
```

## 2 Create the autostart file

```bash
sudo nano /home/logserv/.config/autostart/CamDash.desktop
```

```ini
[Desktop Entry]
Type=Application
Name=CamDash
Exec=firefox --kiosk http://172.17.1.56:8080/
X-GNOME-Autostart-enabled=true
NoDisplay=false
Hidden=false
Terminal=false
```

Note: Replace the URL with your CamDash address.

## 3 Edit GNOME variables

```bash
sudo nano /etc/gdm3/daemon.conf
```

**Uncomment / edit:**

```ini
[daemon]
AutomaticLoginEnabled = true
AutomaticLogin = logserv
```

## 4 Enable user extensions in GNOME

```bash
gsettings set org.gnome.shell disable-user-extensions false
```

## 5 Configure Firefox

1) Allow media to play in Firefox.
2) Download the GNOME Shell extension for Firefox: <https://extensions.gnome.org/#>
3) Install these GNOME Shell extensions:

- **Dash-to-Dock** -> <https://extensions.gnome.org/extension/307/dash-to-dock/>
- **Hide-Top-Bar** -> <https://extensions.gnome.org/extension/545/hide-top-bar/>

## 6 Energy settings

- **Settings** -> **Energy Settings** -> set to "Performance" and deactivate sleep modes
- Run the following commands as **logserv**:
  (***DO NOT USE SUDO!*** If you do: You are actually modifying root's GNOME config which GNOME never uses.)

```bash
gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type 'nothing'
gsettings set org.gnome.settings-daemon.plugins.power idle-dim false
gsettings set org.gnome.desktop.session idle-delay 0
gsettings set org.gnome.desktop.screensaver lock-enabled false
```
