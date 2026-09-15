#!/bin/bash
# Build the four CREW-Wildfire images for linux/amd64, push them to Docker Hub, and pin
# deploy/docker-compose.yml to the exact digests that were pushed (so the server always
# pulls a known-good set of images).
#
# Usage:   ./build-images.sh [TAG]            TAG defaults to "latest"
#          DOCKER_USER=yourname ./build-images.sh
# Needs:   docker login (Docker Hub), and the Unity Linux build in
#          crew-dojo/Builds/Wildfire-StandaloneLinux64-Server/ (see README, "Building your own images")
set -euo pipefail
cd "$(dirname "$0")"

DOCKER_USER="${DOCKER_USER:-jphyun2019}"
TAG="${1:-latest}"
COMPOSE_FILE="deploy/docker-compose.yml"
UNITY_BIN="crew-dojo/Builds/Wildfire-StandaloneLinux64-Server/Unity.x86_64"

if [ ! -f "$UNITY_BIN" ]; then
  echo "Missing the Unity Linux build: $UNITY_BIN"
  echo "Build it first (README, 'Building your own images')."
  exit 1
fi

echo "Building $DOCKER_USER/wildfire-*:$TAG for linux/amd64 ..."

docker build --platform linux/amd64 \
  -f crew-dojo/Nakama/Dockerfile \
  -t "$DOCKER_USER/wildfire-nakama:$TAG" \
  crew-dojo/Nakama

# The website talks to the backend through the relative path /api (routed by Caddy),
# so the same image works on any domain or IP address.
docker build --platform linux/amd64 \
  -f wildfire-human-interface/Dockerfile.frontend \
  --build-arg NEXT_PUBLIC_API_URL=/api \
  -t "$DOCKER_USER/wildfire-frontend:$TAG" \
  wildfire-human-interface

docker build --platform linux/amd64 \
  -f wildfire-human-interface/Dockerfile.backend \
  -t "$DOCKER_USER/wildfire-backend:$TAG" \
  wildfire-human-interface

docker build --platform linux/amd64 \
  -f Dockerfile.algorithm \
  -t "$DOCKER_USER/wildfire-algorithm:$TAG" \
  .

for name in nakama frontend backend algorithm; do
  docker push "$DOCKER_USER/wildfire-$name:$TAG"
done

echo
echo "Pinning $COMPOSE_FILE to the pushed digests ..."
python3 - "$COMPOSE_FILE" "$DOCKER_USER" "$TAG" <<'EOF'
import json, re, subprocess, sys

compose_file, user, tag = sys.argv[1:]
text = open(compose_file).read()
for name in ("nakama", "frontend", "backend", "algorithm"):
    repo = f"{user}/wildfire-{name}"
    digests = json.loads(subprocess.check_output(
        ["docker", "inspect", "--format", "{{json .RepoDigests}}", f"{repo}:{tag}"], text=True))
    pinned = next((d for d in digests if d.startswith(repo + "@")), None)
    if not pinned:
        sys.exit(f"no pushed digest found for {repo}:{tag}")
    text, n = re.subn(rf"image: \S*wildfire-{name}\S*", f"image: {pinned}", text)
    if n != 1:
        sys.exit(f"expected exactly one image line for {name} in {compose_file}, found {n}")
    print(f"  {name}: {pinned}")
open(compose_file, "w").write(text)
EOF

echo
echo "Done. To deploy the new images on the server:"
echo "  source ~/.wildfire_aws"
echo "  scp -i ~/wildfire-key.pem $COMPOSE_FILE ubuntu@\$ELASTIC_IP:~/wildfire/docker-compose.yml"
echo "  ssh -i ~/wildfire-key.pem ubuntu@\$ELASTIC_IP 'cd ~/wildfire && docker compose pull && docker compose up -d'"
