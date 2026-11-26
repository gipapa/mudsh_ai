FROM node:24-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      bash binutils file libimage-exiftool-perl util-linux \
    && rm -rf /var/lib/apt/lists/* \
    && install -d -m 0700 -o node -g node /expedition

COPY game.mjs shell.bash play.bash bridge.bash terminal.bash /opt/mudsh/
COPY fflate-LICENSE /opt/mudsh/
USER node
WORKDIR /expedition
ENV HOME=/expedition
ENTRYPOINT ["/bin/bash", "/opt/mudsh/play.bash"]
