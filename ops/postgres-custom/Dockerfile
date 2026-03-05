FROM postgres:18

# Keep base behavior while allowing controlled customization.
# Add SQL init scripts under ops/postgres-custom/initdb/*.sql when needed.
COPY ops/postgres-custom/initdb/ /docker-entrypoint-initdb.d/
