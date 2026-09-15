#!/bin/bash
# One-time server setup for CREW-Wildfire on an AWS EC2 instance running the
# "Deep Learning Base OSS Nvidia Driver GPU AMI (Ubuntu 22.04)".
#
# Run it from the folder you copied this file to (normally ~/wildfire):
#     bash setup-server.sh
# It is safe to run more than once.
set -euo pipefail

WILDFIRE_DIR="$(cd "$(dirname "$0")" && pwd)"
RUN_USER="$(id -un)"

step() { echo; echo "==> $*"; }

step "Checking the NVIDIA driver"
if ! nvidia-smi >/dev/null 2>&1; then
  echo "nvidia-smi failed: no NVIDIA driver found."
  echo "Create the server from the 'Deep Learning Base OSS Nvidia Driver GPU AMI' (README, Step 1)."
  exit 1
fi
nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader

step "Installing Docker (skipped if already present)"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
fi
if ! docker compose version >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo apt-get install -y -qq docker-compose-plugin
fi
sudo usermod -aG docker "$RUN_USER"

step "Installing the NVIDIA Container Toolkit (lets containers use the GPU)"
if ! command -v nvidia-ctk >/dev/null 2>&1; then
  curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
    | sudo gpg --dearmor --yes -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
  curl -fsSL https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
    | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
    | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list >/dev/null
  sudo apt-get update -qq
  sudo apt-get install -y -qq nvidia-container-toolkit
fi
sudo nvidia-ctk runtime configure --runtime=docker >/dev/null
sudo systemctl restart docker

step "Installing the display server the game engine renders through"
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq xserver-xorg x11-xserver-utils
if [ ! -f /etc/X11/xorg.conf ]; then
  BUS_ID=""
  if command -v nvidia-xconfig >/dev/null 2>&1; then
    BUS_ID="$(nvidia-xconfig --query-gpu-info 2>/dev/null | sed -n 's/.*PCI BusID *: *//p' | head -1)"
  fi
  if [ -z "$BUS_ID" ]; then
    # nvidia-smi prints e.g. 00000000:00:1E.0 (hex); X wants PCI:bus:device:function in decimal
    RAW="$(nvidia-smi --query-gpu=pci.bus_id --format=csv,noheader | head -1)"
    BUS_ID="PCI:$((16#${RAW:9:2})):$((16#${RAW:12:2})):$((16#${RAW:15:1}))"
  fi
  echo "GPU bus id: $BUS_ID"
  sudo tee /etc/X11/xorg.conf >/dev/null <<XEOF
Section "Device"
    Identifier     "Device0"
    Driver         "nvidia"
    BusID          "$BUS_ID"
    Option         "AllowEmptyInitialConfiguration" "True"
EndSection

Section "Screen"
    Identifier     "Screen0"
    Device         "Device0"
    DefaultDepth    24
    SubSection     "Display"
        Depth       24
        Virtual     1280 1024
    EndSubSection
EndSection
XEOF
fi

step "Creating data folders"
mkdir -p "$WILDFIRE_DIR"/data/postgres "$WILDFIRE_DIR"/data/results "$WILDFIRE_DIR"/data/tmp "$WILDFIRE_DIR"/data/huggingface

step "Installing auto-start on reboot (display server + containers)"
sed -e "s#/home/ubuntu/wildfire#$WILDFIRE_DIR#g" -e "s#^User=ubuntu#User=$RUN_USER#" \
  "$WILDFIRE_DIR/wildfire.service" | sudo tee /etc/systemd/system/wildfire.service >/dev/null
sudo cp "$WILDFIRE_DIR/wildfire-x.service" /etc/systemd/system/wildfire-x.service
sudo systemctl daemon-reload
sudo systemctl enable --now wildfire-x.service
# Containers start automatically on every later boot; the first start is done by hand (README, Step 4)
sudo systemctl enable wildfire.service
sleep 3
if systemctl is-active --quiet wildfire-x.service; then
  echo "Display server running on :0"
else
  echo "The display server failed to start. Look at:  sudo journalctl -u wildfire-x"
  exit 1
fi

step "Checking that containers can see the GPU"
sudo docker run --rm --gpus all nvidia/cuda:11.8.0-base-ubuntu22.04 nvidia-smi --query-gpu=name --format=csv,noheader

echo
echo "Setup complete."
echo "Next: log out and back in (type: exit, then ssh again) so the Docker permission applies,"
echo "then continue with Step 3 of the README:"
echo "    cd $WILDFIRE_DIR && cp .env.example .env && nano .env"
