#!/bin/bash

# Script de Deploy para EasyPanel - ZapBot
# Autor: Sistema Automatizado
# Versão: 1.0

set -e

echo "🚀 Iniciando deploy do ZapBot no EasyPanel..."

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Função para log colorido
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Verificar se estamos no diretório correto
if [ ! -f "package.json" ]; then
    log_error "Arquivo package.json não encontrado. Execute este script no diretório raiz do projeto."
    exit 1
fi

# Verificar se o Docker está instalado
if ! command -v docker &> /dev/null; then
    log_error "Docker não está instalado. Instale o Docker primeiro."
    exit 1
fi

# Verificar se o docker-compose está instalado
if ! command -v docker-compose &> /dev/null; then
    log_error "Docker Compose não está instalado. Instale o Docker Compose primeiro."
    exit 1
fi

# Verificar se o arquivo .env existe
if [ ! -f ".env" ]; then
    log_warning "Arquivo .env não encontrado. Copiando do exemplo..."
    if [ -f "env.example" ]; then
        cp env.example .env
        log_info "Arquivo .env criado. Configure suas variáveis de ambiente antes de continuar."
        log_info "Edite o arquivo .env com suas credenciais do Supabase."
        exit 1
    else
        log_error "Arquivo env.example não encontrado."
        exit 1
    fi
fi

# Verificar variáveis obrigatórias
log_info "Verificando configurações..."

if ! grep -q "SUPABASE_URL=" .env || grep -q "seu-projeto.supabase.co" .env; then
    log_error "Configure a SUPABASE_URL no arquivo .env"
    exit 1
fi

if ! grep -q "SUPABASE_KEY=" .env || grep -q "sua-chave-service-role" .env; then
    log_error "Configure a SUPABASE_KEY no arquivo .env"
    exit 1
fi

log_success "Configurações verificadas!"

# Build da imagem Docker
log_info "Construindo imagem Docker..."
docker build -t zapbot:latest .

if [ $? -eq 0 ]; then
    log_success "Imagem Docker construída com sucesso!"
else
    log_error "Falha ao construir a imagem Docker."
    exit 1
fi

# Parar containers existentes
log_info "Parando containers existentes..."
docker-compose down 2>/dev/null || true

# Iniciar o serviço
log_info "Iniciando serviços..."
docker-compose up -d

if [ $? -eq 0 ]; then
    log_success "Serviços iniciados com sucesso!"
else
    log_error "Falha ao iniciar os serviços."
    exit 1
fi

# Aguardar alguns segundos para o serviço inicializar
log_info "Aguardando inicialização do serviço..."
sleep 10

# Verificar se o serviço está rodando
if docker-compose ps | grep -q "Up"; then
    log_success "ZapBot está rodando!"
    
    # Tentar fazer health check
    log_info "Verificando health check..."
    if curl -f http://localhost:3000/health > /dev/null 2>&1; then
        log_success "Health check passou! Serviço está saudável."
        log_info "Acesse http://localhost:3000 para ver o QR code"
    else
        log_warning "Health check falhou. Verificando logs..."
        docker-compose logs --tail=20 zapbot
    fi
else
    log_error "Serviço não está rodando. Verificando logs..."
    docker-compose logs zapbot
    exit 1
fi

echo ""
log_success "🎉 Deploy concluído com sucesso!"
echo ""
echo "📋 Informações do Deploy:"
echo "  • Serviço: ZapBot WhatsApp Monitor"
echo "  • Porta: 3000"
echo "  • Health Check: http://localhost:3000/health"
echo "  • Interface Web: http://localhost:3000"
echo ""
echo "📝 Próximos passos:"
echo "  1. Acesse http://localhost:3000 no navegador"
echo "  2. Escaneie o QR code com seu WhatsApp"
echo "  3. Monitore os logs: docker-compose logs -f zapbot"
echo ""
echo "🔧 Comandos úteis:"
echo "  • Ver logs: docker-compose logs -f zapbot"
echo "  • Parar serviço: docker-compose down"
echo "  • Reiniciar: docker-compose restart zapbot"
echo "  • Status: docker-compose ps"
echo ""

log_info "Deploy finalizado!" 