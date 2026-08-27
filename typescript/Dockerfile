# Builds and runs only the MCP document server (src/mcpServer.ts) for
# remote/streamable-HTTP deployment (e.g. AWS App Runner) — not the CLI
# chat client (src/main.ts), which is meant to run locally.
#
# Runs via the tsx loader (same as `npm run dev` locally) rather than a
# `tsc` build: `tsc` compiles the whole `src/` tree together, and a type
# error in an unrelated file elsewhere in `src/` (e.g. the CLI client)
# shouldn't block deploying just the server.

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci

COPY src ./src

EXPOSE 3000

# App Runner maps its configured port to whatever the container listens on;
# EXPOSE is documentation only. mcpServer.ts reads PORT at runtime (falls
# back to 3000) and binds to 0.0.0.0.
CMD ["node", "--import", "tsx", "src/mcpServer.ts"]
