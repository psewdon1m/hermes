FROM nginx:alpine

COPY nginx/nginx.conf.template /etc/nginx/templates/nginx.conf.template
COPY nginx/entrypoint.sh /entrypoint.sh
COPY web /usr/share/nginx/html

RUN chmod +x /entrypoint.sh

EXPOSE 80 443

ENTRYPOINT ["/entrypoint.sh"]
