FROM node:16-buster-slim

# Instalar dependências do sistema e Chromium
RUN apt-get update \
    && apt-get install -y wget gnupg \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y \
    google-chrome-stable \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    libxss1 \
    libxtst6 \
    libgconf-2-4 \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libgbm1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Configurar variáveis de ambiente
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
ENV NODE_ENV=production
ENV CHROME_PATH=/usr/bin/google-chrome-stable
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
    chown -R node:node /app && \
    chmod -R 777 /usr/bin/google-chrome-stable

# Mudar para usuário não-root
USER node

# Iniciar a aplicação com mais logs
CMD ["sh", "-c", "node index.js 2>&1 | tee -a /app/logs/app.log"] 