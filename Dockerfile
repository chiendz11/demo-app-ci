# syntax=docker/dockerfile:1

FROM node:24-alpine AS builder

WORKDIR /build

COPY package.json package-lock.json ./

RUN npm ci --omit=dev \
    && npm cache clean --force

COPY app/server.js ./server.js

RUN node --check server.js

FROM node:24-alpine AS runtime

RUN rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx

ARG BUILD_DATE
ARG VERSION
ARG VCS_REF

LABEL org.opencontainers.image.title="demo-app" \
      org.opencontainers.image.description="Observable Node.js application deployed through GitHub Actions" \
      org.opencontainers.image.source="https://github.com/chiendz11/demo-app-ci" \
      org.opencontainers.image.authors="Bui Anh Chien" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${VCS_REF}"

ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app

COPY --from=builder --chown=node:node /build/package.json ./package.json
COPY --from=builder --chown=node:node /build/node_modules ./node_modules
COPY --from=builder --chown=node:node /build/server.js ./server.js

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["node", "-e", "const http=require('http');const req=http.get({host:'127.0.0.1',port:process.env.PORT||3000,path:'/health'},res=>process.exit(res.statusCode===200?0:1));req.on('error',()=>process.exit(1));req.setTimeout(2000,()=>{req.destroy();process.exit(1);});"]

STOPSIGNAL SIGTERM
CMD ["node", "server.js"]
