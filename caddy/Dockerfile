FROM caddy:2-alpine

# Copy site configuration
COPY caddy/Caddyfile /etc/caddy/Caddyfile

# Copy static assets served by Caddy
COPY web /srv

# Expose standard Caddy ports
EXPOSE 80 443

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
