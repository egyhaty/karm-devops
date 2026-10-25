# syntax=docker/dockerfile:1
# Build only after selecting immutable upstream and Codex versions. No defaults
# intentionally: a tag such as latest must not silently determine production code.
ARG HERMES_BASE_IMAGE
FROM ${HERMES_BASE_IMAGE}
USER root
ARG CODEX_VERSION
RUN test -n "$CODEX_VERSION" && npm install --prefix /usr/local -g "@openai/codex@${CODEX_VERSION}" && npm cache clean --force
COPY --chown=0:0 config/SOUL.md /opt/karem/config/SOUL.md
COPY --chown=0:0 skills /opt/karem/skills
COPY --chown=0:0 scripts /opt/karem/scripts
COPY --chown=0:0 docs /opt/karem/docs
RUN chmod -R a+rX,go-w /opt/karem && \
    test -x /opt/hermes/.venv/bin/hermes && \
    test -x /opt/hermes/.venv/bin/python && \
    test "$(id -u hermes)" = "10000" && \
    codex --version
ENV HERMES_HOME=/opt/data
ENV HOME=/opt/data
ENV PYTHONDONTWRITEBYTECODE=1
WORKDIR /opt/hermes
USER 10000:10000
# Bypass the official image's root/s6 bootstrap intentionally. Our own bootstrap
# seeds only project configuration; Kubernetes supplies UID and volume ownership.
ENTRYPOINT ["/opt/hermes/.venv/bin/python", "/opt/karem/scripts/bootstrap.py", "--exec"]
