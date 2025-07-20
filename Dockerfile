# Usar Node.js 18 LTS para melhor compatibilidade
FROM node:18-slim

# Instalar dependências do sistema e Chrome
RUN apt-get update \
    && apt-get install -y wget gnupg ca-certificates curl \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y \
    google-chrome-stable \
    fonts-liberation \
    fonts-noto-color-emoji \
    fonts-noto-cjk \
    libxss1 \
    libxtst6 \
    libgconf-2-4 \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libgtk-3-0 \
    libgbm1 \
    libasound2 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Configurar variáveis de ambiente para produção
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
ENV CHROME_PATH=/usr/bin/google-chrome-stable
ENV DEPLOY_ENV=production
ENV PORT=3000

# Criar usuário não-root e diretórios necessários
RUN groupadd -r zapbot && useradd -r -g zapbot -G audio,video zapbot \
    && mkdir -p /home/zapbot/.local/share/applications \
    && mkdir -p /home/zapbot/.config \
    && mkdir -p /home/zapbot/.cache \
    && chown -R zapbot:zapbot /home/zapbot

# Criar diretório de trabalho
WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências de produção
RUN npm install --production && npm cache clean --force

# Copiar código da aplicação
COPY . .

# Criar diretórios necessários e configurar permissões
RUN mkdir -p /app/.wwebjs_auth /app/.wwebjs_cache /app/logs \
    && chown -R zapbot:zapbot /app \
    && chmod -R 755 /app

# Mudar para usuário não-root
USER zapbot

# Expor porta
EXPOSE 3000

# Health check mais tolerante
HEALTHCHECK --interval=60s --timeout=30s --start-period=180s --retries=5 \
    CMD curl -f http://localhost:3000/health || exit 1

# Comando de inicialização ultra-otimizado para baixo consumo
# Start Node.js with CRITICAL VPS optimizations for 2 vCPU
CMD ["node", "--max-old-space-size=256", "--gc-interval=500", "--expose-gc", "--optimize-for-size", "--max-semi-space-size=16", "index.js"] 