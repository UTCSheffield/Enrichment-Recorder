#!/bin/sh
set -eu
# Diagnostic and explicit migration commands must remain free of startup writes.
if [ "${1:-}" = 'apache2-foreground' ]; then
    php /var/www/html/scripts/startup.php
fi
exec docker-php-entrypoint "$@"
