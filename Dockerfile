# syntax=docker/dockerfile:1

FROM node:20 AS builder

WORKDIR /build

COPY app/server.js ./server.js

RUN node --check server.js \
    && mkdir -p /out \
    && cp server.js /out/server.js

FROM node:20-alpine AS runtime

LABEL org.opencontainers.image.title="day-5-node-app" \
      org.opencontainers.image.description="Simple Node.js HTTP app for Docker practice" \
      org.opencontainers.image.source="https://github.com/chiendz11/demo-app-ci" \
      org.opencontainers.image.authors="Bui Anh Chien"

ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app

COPY --from=builder --chown=node:node /out/server.js ./server.js

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["node", "-e", "const http=require('http');const req=http.get({host:'127.0.0.1',port:process.env.PORT||3000,path:'/'},res=>process.exit(res.statusCode===200?0:1));req.on('error',()=>process.exit(1));req.setTimeout(2000,()=>{req.destroy();process.exit(1);});"]

CMD ["node", "server.js"]
