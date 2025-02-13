FROM node:16-slim

# Instalar dependências do sistema e Chromium
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-sandbox \
    gconf-service \
    libasound2 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgcc1 \
    libgconf-2-4 \
    libgdk-pixbuf2.0-0 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    ca-certificates \
    fonts-liberation \
    libappindicator1 \
    libnss3 \
    lsb-release \
    xdg-utils \
    wget \
    libgbm1 \
    libgbm-dev \
    && rm -rf /var/lib/apt/lists/*

# Configurar variáveis de ambiente
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production
ENV CHROME_PATH=/usr/bin/chromium
ENV DEPLOY_ENV=production

# Criar diretório de trabalho
WORKDIR /app

# Criar diretórios necessários com permissões corretas
RUN mkdir -p /app/.wwebjs_auth /app/.wwebjs_cache /app/logs && \
    chmod -R 777 /app && \
    chown -R node:node /app

# Copiar package.json e package-lock.json
COPY package*.json ./

# Instalar dependências
RUN npm install

# Copiar o resto dos arquivos
COPY . .

# Garantir permissões de escrita para todos os arquivos
RUN chmod -R 777 /app && \
    chown -R node:node /app

# Mudar para usuário não-root
USER node

# Iniciar a aplicação
CMD ["node", "index.js"] 