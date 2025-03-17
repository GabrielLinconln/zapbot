# Bot de Monitoramento para WhatsApp

Bot que registra entradas e saídas de participantes em grupos do WhatsApp, armazenando os dados no Supabase em uma tabela única para fácil consulta e análise.

## Funcionalidades

- Monitora eventos JOIN e LEAVE em grupos do WhatsApp
- Registra todos os eventos em uma única tabela no Supabase
- Sistema de fallback para Google Sheets
- Logs locais para backup e diagnóstico
- Mecanismo anti-duplicação de eventos
- Reconexão automática em caso de falha

## Pré-requisitos

- Node.js 16.x ou superior
- Google Chrome instalado
- Conta no Supabase com tabela configurada
- Credenciais do Google Sheets (opcional para fallback)

## Configuração

1. Clone o repositório:
```
git clone https://github.com/GabrielLinconln/bot-1.git
cd bot-1
```

2. Instale as dependências:
```
npm install
```

3. Configure o arquivo .env com suas credenciais:
```
SUPABASE_URL="https://seu-projeto.supabase.co"
SUPABASE_KEY="sua-chave-service-role"
SPREADSHEET_ID="id-da-planilha-fallback"
```

4. Configure a tabela no Supabase:
   - Execute o script SQL no arquivo `create_table_simple.sql` no Editor SQL do Supabase

## Executando o Bot

```
node index.js
```

Escaneie o QR Code com o WhatsApp para autenticar o bot.

## Manutenção

- Logs são salvos no arquivo `log.txt`
- O QR Code é salvo em `qr-code.txt` e também exibido no terminal
- O bot tenta reconectar automaticamente em caso de falha na conexão

## Suporte e Contribuições

Para relatar problemas ou contribuir com o projeto, abra uma issue ou um pull request no GitHub. 