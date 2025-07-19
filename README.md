# 🤖 ZapBot - Monitoramento WhatsApp

Bot profissional que monitora e registra eventos de entrada e saída em grupos do WhatsApp, com armazenamento no Supabase e interface web integrada.

## ✨ Funcionalidades

- 📊 **Monitoramento em Tempo Real**: Detecta eventos JOIN e LEAVE em grupos
- 🗄️ **Banco de Dados Robusto**: Armazena dados no Supabase com sistema anti-duplicação
- 🌐 **Interface Web**: Visualização do QR code e status do bot
- 🔄 **Auto-Reconexão**: Sistema inteligente de reconexão automática
- 📝 **Logs Detalhados**: Sistema completo de logs para diagnóstico
- ⚡ **Alta Performance**: Otimizado para ambientes de produção
- 🐳 **Docker Ready**: Containerizado para deploy fácil

## 🚀 Deploy no EasyPanel (Hostinger VPS)

### **Pré-requisitos**
- VPS Hostinger com EasyPanel instalado
- Conta no Supabase configurada
- Docker e Docker Compose (instalados automaticamente pelo EasyPanel)

### **1. Configuração do Supabase**

1. Acesse [Supabase](https://app.supabase.com)
2. Crie um novo projeto ou use um existente
3. Vá em **Settings > API**
4. Copie a **URL** e **service_role key**
5. No **SQL Editor**, execute o script `create_table_simple.sql`

### **2. Deploy no EasyPanel**

#### **Opção A: Via Git Repository**
1. No EasyPanel, clique em **"New Service"**
2. Selecione **"From Git Repository"**
3. Cole a URL do repositório
4. Configure as variáveis de ambiente:
   ```
   SUPABASE_URL=https://seu-projeto.supabase.co
   SUPABASE_KEY=sua-service-role-key
   PORT=3000
   NODE_ENV=production
   DEPLOY_ENV=production
   ```
5. Defina a porta como **3000**
6. Clique em **"Deploy"**

#### **Opção B: Via Docker Compose**
1. Faça upload dos arquivos do projeto para sua VPS
2. No EasyPanel, clique em **"New Service"**
3. Selecione **"Docker Compose"**
4. Cole o conteúdo do arquivo `docker-compose.yml`
5. Configure as variáveis de ambiente no painel
6. Clique em **"Deploy"**

### **3. Configuração Pós-Deploy**

1. **Acesse a Interface Web**: `https://seu-dominio:3000`
2. **Escaneie o QR Code** com seu WhatsApp
3. **Monitore os Logs** no painel do EasyPanel
4. **Verifique o Health Check**: `https://seu-dominio:3000/health`

## 🛠️ Desenvolvimento Local

### **Instalação**
```bash
# Clone o repositório
git clone <url-do-repositorio>
cd zapbot

# Instale as dependências
npm install

# Configure as variáveis de ambiente
cp env.example .env
# Edite o arquivo .env com suas credenciais

# Execute o bot
npm start
```

### **Com Docker**
```bash
# Build da imagem
docker build -t zapbot .

# Execute o container
docker run -p 3000:3000 --env-file .env zapbot
```

### **Com Docker Compose**
```bash
# Configure as variáveis no .env
# Execute o stack completo
docker-compose up -d
```

## 📋 Variáveis de Ambiente

| Variável | Descrição | Obrigatória |
|----------|-----------|-------------|
| `SUPABASE_URL` | URL do projeto Supabase | ✅ |
| `SUPABASE_KEY` | Service role key do Supabase | ✅ |
| `PORT` | Porta do servidor web (padrão: 3000) | ❌ |
| `NODE_ENV` | Ambiente de execução | ❌ |
| `DEPLOY_ENV` | Tipo de deploy | ❌ |

## 🔍 Monitoramento

### **Endpoints Disponíveis**
- `GET /` - Interface web com QR code
- `GET /health` - Status de saúde da aplicação
- `GET /qrcode` - Imagem do QR code

### **Health Check Response**
```json
{
  "status": "ok",
  "timestamp": "2025-07-13T04:58:42.754Z",
  "environment": "production",
  "qrcode_available": true
}
```

## 📊 Estrutura do Banco de Dados

### **Tabela: whatsapp_events**
```sql
CREATE TABLE whatsapp_events (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  event_type VARCHAR(10) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  group_id VARCHAR(255) NOT NULL,
  group_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  event_key TEXT UNIQUE NOT NULL
);
```

## 🔧 Manutenção

### **Logs**
- Logs da aplicação: Volume `zapbot_logs`
- Logs do Docker: `docker logs zapbot`
- Logs do sistema: Painel do EasyPanel

### **Backup**
- Dados de sessão: Volume `zapbot_data`
- Cache: Volume `zapbot_cache`
- Banco de dados: Backup automático do Supabase

### **Atualizações**
```bash
# Pull da nova versão
git pull origin main

# Rebuild e restart
docker-compose down
docker-compose up -d --build
```

## 🐛 Troubleshooting

### **Bot não conecta ao WhatsApp**
- Verifique se o QR code está sendo gerado
- Certifique-se de que o Chrome está instalado no container
- Verifique os logs para erros de autenticação

### **Erro de conexão com Supabase**
- Verifique as credenciais no arquivo `.env`
- Confirme se a tabela foi criada corretamente
- Teste a conectividade de rede

### **Container não inicia**
- Verifique se todas as variáveis de ambiente estão configuradas
- Confirme se a porta 3000 está disponível
- Verifique os logs do Docker

## 📈 Performance

### **Recursos Recomendados**
- **CPU**: 1-2 vCPUs
- **RAM**: 2-4 GB
- **Storage**: 10-20 GB SSD
- **Bandwidth**: Ilimitado

### **Otimizações**
- Cache de sessão persistente
- Compressão de logs
- Health checks automáticos
- Restart policies configuradas

## 🔒 Segurança

- Container executa com usuário não-root
- Capabilities limitadas do Docker
- Health checks para monitoramento
- Logs de auditoria completos
- Variáveis de ambiente protegidas

## 📞 Suporte

Para suporte técnico ou dúvidas:
- Verifique os logs da aplicação
- Consulte a documentação do EasyPanel
- Monitore o status do Supabase

---

**Desenvolvido com ❤️ para monitoramento profissional do WhatsApp** 