# Bot de Monitoramento para WhatsApp

Bot que registra entradas e saídas de participantes em grupos do WhatsApp, armazenando os dados no Supabase em uma tabela única para fácil consulta e análise.

## Funcionalidades

- Monitora eventos JOIN e LEAVE em grupos do WhatsApp
- Registra todos os eventos em uma única tabela no Supabase
- Sistema de fallback para Google Sheets
- Logs locais para backup e diagnóstico
- Mecanismo anti-duplicação de eventos
- Reconexão automática em caso de falha
- Servidor web para visualização do QR code

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
PORT=3000
```

4. Configure a tabela no Supabase:
   - Execute o script SQL no arquivo `create_table_simple.sql` no Editor SQL do Supabase

## Executando o Bot

```
node index.js
```

O bot iniciará um servidor web na porta configurada (padrão: 3000), que você pode acessar para visualizar o QR code em uma interface amigável.

### QR Code

Ao iniciar, o bot gera um QR code que pode ser visualizado de três formas:

1. **Interface Web**: Acesse `http://localhost:3000` (ou a URL do seu deploy no Railway)
2. **Terminal**: O QR code é exibido em ASCII no terminal (pode não funcionar corretamente em alguns terminais)
3. **URLs Externas**: Links para QR code são gerados e exibidos no console

Escaneie o QR Code com o WhatsApp para autenticar o bot.

## Deploy no Railway

Quando hospedado no Railway:

1. Certifique-se de que a porta está configurada corretamente nas variáveis de ambiente
2. Acesse a URL fornecida pelo Railway (em Settings > Domains) para visualizar o QR code
3. O servidor web atualiza automaticamente a página a cada 30 segundos

## Manutenção

- Logs são salvos no arquivo `log.txt`
- O QR Code é salvo em `qr-code.txt` e também como imagem em `qr-code.png`
- O bot tenta reconectar automaticamente em caso de falha na conexão
- Um endpoint de saúde está disponível em `/health` para monitoramento

## Suporte e Contribuições

Para relatar problemas ou contribuir com o projeto, abra uma issue ou um pull request no GitHub. 