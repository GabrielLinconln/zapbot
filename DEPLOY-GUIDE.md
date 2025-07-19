# 🚀 Guia Rápido de Deploy - EasyPanel

## ⚡ Deploy Rápido (5 minutos)

### 1. **Configurar Supabase**
```bash
# 1. Acesse https://app.supabase.com
# 2. Crie um projeto novo
# 3. Vá em Settings > API
# 4. Copie URL e service_role key
# 5. No SQL Editor, execute: create_table_simple.sql
```

### 2. **Configurar Variáveis de Ambiente**
```bash
# No EasyPanel, configure:
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_KEY=sua-service-role-key-aqui
PORT=3000
NODE_ENV=production
DEPLOY_ENV=production
```

### 3. **Deploy no EasyPanel**

#### Opção A: Git Repository
```bash
# 1. EasyPanel > New Service > From Git Repository
# 2. Cole a URL do repo
# 3. Configure as variáveis acima
# 4. Port: 3000
# 5. Deploy!
```

#### Opção B: Docker Compose
```bash
# 1. Upload dos arquivos para VPS
# 2. EasyPanel > New Service > Docker Compose
# 3. Cole o conteúdo do docker-compose.yml
# 4. Configure variáveis de ambiente
# 5. Deploy!
```

### 4. **Verificar Deploy**
```bash
# Acesse: https://seu-dominio:3000
# Health Check: https://seu-dominio:3000/health
# Logs: Painel do EasyPanel
```

## 🔧 Comandos Úteis

### Deploy Local (Teste)
```bash
# Configurar ambiente
cp env.example .env
# Editar .env com suas credenciais

# Deploy com script automático
./deploy-easypanel.sh

# Ou manual
docker-compose up -d
```

### Monitoramento
```bash
# Ver logs
docker-compose logs -f zapbot

# Status dos containers
docker-compose ps

# Health check
curl http://localhost:3000/health
```

### Manutenção
```bash
# Restart
docker-compose restart zapbot

# Parar
docker-compose down

# Atualizar
git pull origin main
docker-compose down
docker-compose up -d --build
```

## 📋 Checklist de Deploy

- [ ] Supabase configurado
- [ ] Tabela `whatsapp_events` criada
- [ ] Variáveis de ambiente configuradas
- [ ] Deploy realizado no EasyPanel
- [ ] Health check passando
- [ ] QR code sendo gerado
- [ ] WhatsApp autenticado
- [ ] Eventos sendo registrados

## 🐛 Problemas Comuns

### Container não inicia
```bash
# Verificar logs
docker-compose logs zapbot

# Verificar variáveis
echo $SUPABASE_URL
echo $SUPABASE_KEY
```

### QR code não aparece
```bash
# Verificar se Chrome está instalado
docker exec zapbot which google-chrome-stable

# Verificar logs do navegador
docker-compose logs zapbot | grep -i chrome
```

### Supabase não conecta
```bash
# Testar conectividade
curl -I https://seu-projeto.supabase.co

# Verificar credenciais no painel do Supabase
```

## 🎯 Recursos do Sistema

### Mínimo Recomendado
- CPU: 1 vCPU
- RAM: 2 GB
- Storage: 10 GB SSD
- Bandwidth: Ilimitado

### Otimizado
- CPU: 2 vCPUs
- RAM: 4 GB
- Storage: 20 GB SSD
- Bandwidth: Ilimitado

## 📞 Suporte

1. **Logs da aplicação**: `docker-compose logs zapbot`
2. **Painel EasyPanel**: Verificar status e logs
3. **Supabase Dashboard**: Monitorar banco de dados
4. **Health Check**: `curl /health`

---

**Deploy realizado com sucesso? Escaneie o QR code e comece a monitorar!** 🎉 