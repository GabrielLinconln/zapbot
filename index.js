require('dotenv').config();
const { Client } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { createClient } = require('@supabase/supabase-js');

const LOG_FILE = path.join(__dirname, 'log.txt');
const QR_FILE = path.join(__dirname, 'qr-code.png');
const DEPLOY_ENV = process.env.DEPLOY_ENV || 'local';

// Adicionar configuração do Google Sheets
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1U7SzPTc2t8SIIcAubigz3oNMUEboDU8oxT5I0KkODq0';
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');

// Inicialização do cliente Supabase
console.log('\n=== Verificando configuração do Supabase ===');
const supabaseUrl = process.env.SUPABASE_URL?.trim();
const supabaseKey = process.env.SUPABASE_KEY?.trim();

console.log('URL configurada:', supabaseUrl);
console.log('Key configurada:', supabaseKey ? 'Presente (começa com: ' + supabaseKey.substring(0, 10) + '...)' : 'Ausente');

if (!supabaseUrl || !supabaseKey) {
  console.error('Erro: Credenciais do Supabase não encontradas no .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false
  },
  global: {
    headers: {
      'Authorization': `Bearer ${supabaseKey}`
    }
  }
});

// Teste de conexão inicial
async function testSupabaseConnection() {
  try {
    console.log('Testando conexão com Supabase...');
    
    // Testa a conexão com uma query simples
    const { error } = await supabase.rpc('exec_sql', {
      query: 'SELECT NOW();'
    });

    if (error) {
      throw new Error(`Erro ao testar conexão: ${error.message}`);
    }

    console.log('Conexão com Supabase estabelecida com sucesso!');
  } catch (error) {
    console.error('Erro ao conectar com Supabase:');
    console.error('Mensagem:', error.message);
    if (error.response) {
      console.error('Detalhes da resposta:', error.response);
    }
    process.exit(1);
  }
}

// Executa o teste de conexão
testSupabaseConnection();

// Função para obter nome do grupo com retry
async function getGroupName(client, chatId, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const chat = await client.getChatById(chatId);
      return chat.name || 'Grupo não identificado';
    } catch (error) {
      console.error(`Tentativa ${attempt} de obter nome do grupo falhou:`, error);
      if (attempt === maxRetries) return chatId;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  return chatId;
}

// Função para sanitizar nome da tabela
function sanitizeTableName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 50);
}

// Função para formatar data para o Supabase
function formatDateForSupabase(dateStr) {
  try {
    // Se já for um objeto Date, usa direto
    if (dateStr instanceof Date) {
      return dateStr.toISOString();
    }

    // Converte string de data BR para formato ISO
    const [datePart, timePart] = dateStr.split(', ');
    const [day, month, year] = datePart.split('/');
    const [hour, minute, second] = timePart ? timePart.split(':') : ['00', '00', '00'];
    
    const date = new Date(year, month - 1, day, hour, minute, second);
    return date.toISOString();
  } catch (error) {
    console.error('Erro ao formatar data:', error);
    // Em caso de erro, retorna a data atual
    return new Date().toISOString();
  }
}

// Função para registrar eventos no Supabase
async function recordEventSupabase(timestamp, eventType, user, group) {
  const tableName = `group_${sanitizeTableName(group)}`;
  console.log('\n=== Iniciando registro no Supabase ===');
  console.log('Dados a registrar:', { timestamp, eventType, user, group });
  
  try {
    // Validar dados de entrada
    if (!timestamp || !eventType || !user || !group) {
      throw new Error('Dados incompletos para registro');
    }

    // Garantir que o timestamp seja válido
    let formattedTimestamp;
    if (timestamp instanceof Date) {
      formattedTimestamp = timestamp.toISOString();
    } else if (typeof timestamp === 'number') {
      formattedTimestamp = new Date(timestamp * 1000).toISOString();
    } else {
      formattedTimestamp = formatDateForSupabase(timestamp);
    }
    
    // Validar timestamp formatado
    if (!Date.parse(formattedTimestamp)) {
      console.error('Timestamp inválido:', formattedTimestamp);
      formattedTimestamp = new Date().toISOString();
    }
    
    console.log('Timestamp formatado:', formattedTimestamp);

    // Criar tabela se não existir
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS "${tableName}" (
        id serial PRIMARY KEY,
        timestamp timestamptz NOT NULL,
        event_type varchar(10) NOT NULL CHECK (event_type IN ('JOIN', 'LEAVE')),
        user_id varchar(255) NOT NULL,
        group_name text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        event_key text NOT NULL DEFAULT 'legacy',
        CONSTRAINT ${tableName}_event_key_unique UNIQUE (event_key)
      );
    `;

    const { error: createError } = await supabase.rpc('exec_sql', { 
      query: createTableQuery 
    });

    if (createError) {
      console.error('Erro ao criar tabela:', createError);
      throw createError;
    }

    // Sanitizar dados para o event_key
    const sanitizedUser = user.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
    const sanitizedTimestamp = formattedTimestamp.replace(/[^0-9]/g, '');
    
    // Gerar event_key único e determinístico
    const eventKey = `${tableName}_${sanitizedUser}_${eventType}_${sanitizedTimestamp}`;
    console.log('Event Key gerado:', eventKey);

    // Preparar dados para inserção
    const insertData = {
      timestamp: formattedTimestamp,
      event_type: eventType,
      user_id: user.replace(/'/g, "''"),
      group_name: group.replace(/'/g, "''"),
      event_key: eventKey
    };

    let result = null;

    try {
      // Primeira tentativa: Inserção com prepared statement
      const insertQuery = `
        INSERT INTO "${tableName}" (
          timestamp,
          event_type,
          user_id,
          group_name,
          event_key
        ) VALUES (
          $1::timestamptz,
          $2,
          $3,
          $4,
          $5
        )
        ON CONFLICT ON CONSTRAINT ${tableName}_event_key_unique 
        DO NOTHING
        RETURNING id, timestamp, event_type, user_id, group_name;
      `;

      const { data, error } = await supabase.rpc('exec_sql', {
        query: insertQuery,
        params: [
          insertData.timestamp,
          insertData.event_type,
          insertData.user_id,
          insertData.group_name,
          insertData.event_key
        ]
      });

      if (!error && data && data.length > 0) {
        result = data;
      } else if (error) {
        throw error;
      }
    } catch (insertError) {
      console.log('Tentando inserção alternativa...');
      
      // Segunda tentativa: Inserção simples
      const simpleInsertQuery = `
        INSERT INTO "${tableName}" (
          timestamp,
          event_type,
          user_id,
          group_name,
          event_key
        ) VALUES (
          '${insertData.timestamp}'::timestamptz,
          '${insertData.event_type}',
          '${insertData.user_id}',
          '${insertData.group_name}',
          '${insertData.event_key}'
        )
        RETURNING id, timestamp, event_type, user_id, group_name;
      `;

      const { data, error } = await supabase.rpc('exec_sql', {
        query: simpleInsertQuery
      });

      if (error) {
        throw error;
      }

      result = data;
    }

    if (!result || result.length === 0) {
      console.log('Evento já registrado ou ignorado');
      return false;
    }

    console.log('Registro inserido com sucesso!');
    console.log('Dados:', result[0]);
    return true;
  } catch (error) {
    console.error('Erro ao registrar no Supabase:', error);
    if (error.details) console.error('Detalhes:', error.details);
    if (error.hint) console.error('Dica:', error.hint);
    throw error;
  }
}

async function appendToSheet(timestamp, eventType, user, group) {
  try {
    console.log('\nIniciando registro na planilha...');
    console.log('Dados a registrar:', { timestamp, eventType, user, group });
    
    // Validação dos dados
    if (!timestamp || !eventType || !user || !group) {
      throw new Error('Dados incompletos para registro na planilha');
    }
    
    // Lê as credenciais do arquivo
    let credentials;
    try {
      credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    } catch (error) {
      throw new Error(`Erro ao ler credenciais: ${error.message}`);
    }
    
    const auth = new google.auth.GoogleAuth({
      credentials: credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    
    const values = [
      [timestamp, user, group, eventType === 'JOIN' ? 'X' : '', eventType === 'LEAVE' ? 'X' : '']
    ];

    console.log('Tentando registrar valores:', values);

    const result = await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Registros!A:E',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: values
      }
    });

    console.log('Registro na planilha concluído:', {
      status: result.status,
      updatedRange: result.data?.updates?.updatedRange,
      updatedRows: result.data?.updates?.updatedRows
    });

    return true;
  } catch (error) {
    console.error('\nERRO AO REGISTRAR NA PLANILHA');
    console.error('Tipo do erro:', error.name);
    console.error('Mensagem:', error.message);
    console.error('Stack:', error.stack);
    
    if (error.response) {
      console.error('Resposta da API:', {
        status: error.response.status,
        data: error.response.data
      });
    }
    
    throw error; // Propaga o erro para tratamento adequado
  }
}

async function getContactName(client, userId) {
  try {
    console.log('Obtendo nome do contato:', userId);
    const contact = await client.getContactById(userId);
    console.log('Contato obtido:', {
      id: contact.id,
      name: contact.name,
      pushname: contact.pushname,
      shortName: contact.shortName,
      verifiedName: contact.verifiedName
    });
    
    // Tenta obter o nome do contato de várias formas possíveis
    const name = contact.name || 
                contact.pushname || 
                contact.shortName || 
                contact.verifiedName;
    
    if (name) {
      console.log('Nome encontrado:', name);
      return name;
    }
    
    // Se não encontrou nome, formata o número
    const formattedNumber = userId
      .replace(/@c\.us/g, '')
      .replace(/^55/, '')
      .replace(/(\d{2})(\d{2})(\d{4,5})(\d{4})/, '$2 $3-$4');
    
    console.log('Nome não encontrado, usando número formatado:', formattedNumber);
    return formattedNumber;
  } catch (error) {
    console.error('Erro ao obter nome do contato:', error);
    // Formata o número em caso de erro
    const formattedNumber = userId
      .replace(/@c\.us/g, '')
      .replace(/^55/, '')
      .replace(/(\d{2})(\d{2})(\d{4,5})(\d{4})/, '$2 $3-$4');
    
    console.log('Usando número formatado devido a erro:', formattedNumber);
    return formattedNumber;
  }
}

// Sistema de Logs e Registro de Eventos
// - Logs locais são salvos em log.txt para referência e debug
// - Eventos são registrados no Supabase com timestamp preciso
// - Cada evento tem uma chave única para evitar duplicatas
// - Sistema robusto para lidar com múltiplos grupos simultaneamente
async function logEventToFile(eventType, user, group, providedTimestamp = null) {
  try {
    const timestamp = providedTimestamp || new Date().toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    
    console.log('\n=== Registrando Evento ===');
    console.log('Tipo:', eventType);
    console.log('Usuário:', user);
    console.log('Grupo:', group);
    console.log('Timestamp:', timestamp);
    
    // Registrar no arquivo de log local
    const logEntry = `${timestamp} - ${eventType} - Usuário(s): ${user} - Grupo: ${group}\n`;
    fs.appendFileSync(LOG_FILE, logEntry, 'utf8');
    
    try {
      // Tentar registrar no Supabase primeiro
      await recordEventSupabase(timestamp, eventType, user, group);
      console.log('Evento registrado com sucesso!');
    } catch (error) {
      console.error('Erro ao registrar no Supabase, tentando Google Sheets:', error);
      await appendToSheet(timestamp, eventType, user, group);
      console.log('Evento registrado com sucesso via fallback!');
    }
  } catch (error) {
    console.error('Erro crítico ao registrar evento:', error);
    // Garantir que pelo menos o log local seja salvo
    try {
      const errorLog = `${new Date().toISOString()} - ERRO - ${error.message} - ${eventType} - ${user} - ${group}\n`;
      fs.appendFileSync(LOG_FILE, errorLog, 'utf8');
    } catch (fsError) {
      console.error('Erro fatal ao salvar log:', fsError);
    }
  }
}

const client = new Client({
  puppeteer: {
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-software-rasterizer',
      '--ignore-certificate-errors',
      '--allow-running-insecure-content',
      '--window-size=1280,720',
      '--disable-web-security',
      '--allow-file-access-from-files'
    ],
    headless: true,
    executablePath: process.platform === 'win32' 
      ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
      : '/usr/bin/google-chrome-stable',
    timeout: 120000,
    defaultViewport: {
      width: 1280,
      height: 720
    },
    ignoreHTTPSErrors: true,
    protocolTimeout: 120000
  },
  qrMaxRetries: 10,
  authTimeoutMs: 120000,
  restartOnAuthFail: true,
  takeoverOnConflict: true,
  takeoverTimeoutMs: 120000,
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
});

// Função para tentar reconectar em caso de erro
async function handleConnectionError(error) {
  console.error('\n=== ERRO DE CONEXÃO ===');
  console.error('Tipo:', error.name);
  console.error('Mensagem:', error.message);
  console.error('Stack:', error.stack);
  
  try {
    console.log('\nTentando reconectar...');
    await client.destroy();
    await client.initialize();
  } catch (reconnectError) {
    console.error('Erro ao tentar reconectar:', reconnectError);
    // Aguarda 1 minuto antes de tentar novamente
    setTimeout(() => handleConnectionError(reconnectError), 60000);
  }
}

// Adicionar logs para debug de inicialização
console.log('\n=== INICIANDO CLIENTE WHATSAPP ===');
console.log('Data/Hora:', new Date().toLocaleString());
console.log('Ambiente:', DEPLOY_ENV);
console.log('Diretório de trabalho:', process.cwd());
console.log('Chrome executable:', process.platform === 'win32' 
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : '/usr/bin/google-chrome-stable');

// Verificar se o executável do Chrome existe
try {
  const chromePath = process.platform === 'win32' 
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : '/usr/bin/google-chrome-stable';
  fs.accessSync(chromePath, fs.constants.X_OK);
  console.log('Google Chrome encontrado em:', chromePath);
} catch (error) {
  console.error('ERRO: Google Chrome não encontrado ou sem permissão de execução');
  console.error('Detalhes:', error);
}

client.on('disconnected', (reason) => {
  console.log('\n=== CLIENTE DESCONECTADO ===');
  console.log('Motivo:', reason);
  handleConnectionError(new Error('Cliente desconectado: ' + reason));
});

client.on('ready', async () => {
  console.log('\n=== CLIENTE WHATSAPP CONECTADO ===');
  console.log('Data/Hora:', new Date().toLocaleString());
  console.log('Ambiente:', DEPLOY_ENV);
  console.log('Bot pronto para monitorar grupos!');
});

// Cache global para eventos processados
const processedEvents = new Set();

// Função para gerar chave de evento consistente
function generateEventKey(notification, eventType) {
  const chatId = notification.chatId;
  const userId = notification.recipientIds?.[0];
  const timestamp = notification.timestamp;
  return `${chatId}_${userId}_${eventType}_${timestamp}`;
}

// Função para verificar evento no log
async function checkEventInLog(eventType, userName, groupName, timestamp) {
  try {
    // Ler últimas 50 linhas do log para verificação
    const logContent = await fs.promises.readFile(LOG_FILE, 'utf8');
    const logLines = logContent.split('\n').slice(-50);
    
    // Formatar timestamp para comparação
    const eventDate = new Date(timestamp * 1000);
    const eventTimestamp = eventDate.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo'
    });
    
    // Procurar por evento similar no log
    return logLines.some(line => {
      return line.includes(eventType) && 
             line.includes(userName) && 
             line.includes(groupName) &&
             // Compara apenas data/hora sem segundos para maior flexibilidade
             line.substring(0, 16) === eventTimestamp.substring(0, 16);
    });
  } catch (error) {
    console.error('Erro ao verificar log:', error);
    return false;
  }
}

// Função para processar eventos de grupo
async function processGroupEvent(notification, eventType) {
  try {
    console.log(`\nProcessando notificação:`, notification);
    
    // Validar dados da notificação
    if (!notification || !notification.id || !notification.chatId) {
      console.error('Notificação inválida:', notification);
      return;
    }

    const userId = notification.recipientIds?.[0];
    if (!userId) {
      console.error('ID do usuário não encontrado na notificação:', notification);
      return;
    }

    // Garantir e validar timestamp
    let timestamp = notification.timestamp;
    if (!timestamp || timestamp <= 0) {
      timestamp = Math.floor(Date.now() / 1000);
      console.log('Timestamp não encontrado ou inválido, usando timestamp atual:', timestamp);
    }
    
    // Gerar chave de evento consistente
    const eventKey = generateEventKey({ ...notification, timestamp }, eventType);

    // Verificar cache com nova chave
    if (processedEvents.has(eventKey)) {
      console.log('Evento já processado (cache), ignorando duplicata...');
      return;
    }

    console.log(`\n=== NOVO EVENTO DE ${eventType} NO GRUPO ===`);
    console.log('Chat ID:', notification.chatId);
    console.log('User ID:', userId);
    console.log('Event Key:', eventKey);
    console.log('Timestamp Unix:', timestamp);
    console.log('Timestamp ISO:', new Date(timestamp * 1000).toISOString());

    // Obter informações necessárias com retry
    let groupName, userName;
    try {
      [groupName, userName] = await Promise.all([
        getGroupName(client, notification.chatId),
        getContactName(client, userId)
      ]);
    } catch (error) {
      console.error('Erro ao obter informações do grupo/usuário:', error);
      // Usar IDs como fallback
      groupName = notification.chatId;
      userName = userId;
    }

    // Criar timestamp no formato ISO8601 com timezone
    const isoTimestamp = new Date(timestamp * 1000).toISOString();

    // Log local primeiro
    const brTimestamp = new Date(timestamp * 1000).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo'
    });
    const logEntry = `${brTimestamp} - ${eventType} - Usuário(s): ${userName} - Grupo: ${groupName}\n`;
    await fs.promises.appendFile(LOG_FILE, logEntry);

    // Registrar no Supabase
    try {
      const success = await recordEventSupabase(timestamp, eventType, userName, groupName);
      if (success) {
        // Adicionar ao cache somente após confirmação do registro
        processedEvents.add(eventKey);
        // Limpar do cache após 5 minutos
        setTimeout(() => processedEvents.delete(eventKey), 300000);
      }
    } catch (error) {
      console.error('Erro ao registrar no Supabase:', error);
      throw error; // Propaga o erro para tratamento adequado
    }

  } catch (error) {
    console.error(`Erro ao processar evento:`, error);
    console.error('Detalhes completos do erro:', {
      message: error.message,
      stack: error.stack,
      details: error?.details,
      hint: error?.hint
    });
  }
}

// Event listeners com async/await
client.on('group_join', async (notification) => {
  try {
    console.log('\nNotificação de JOIN recebida:', notification);
    
    // Garantir timestamp para todos os tipos de evento
    const timestamp = notification.timestamp || Math.floor(Date.now() / 1000);
    
    // Criar uma cópia da notificação com o timestamp garantido
    const processedNotification = {
      ...notification,
      timestamp: timestamp
    };

    // Processar o evento apenas se for um JOIN real ou se for um invite sem JOIN correspondente
    const eventKey = generateEventKey(processedNotification, 'JOIN');
    if (!processedEvents.has(eventKey)) {
      await processGroupEvent(processedNotification, 'JOIN');
    } else {
      console.log('Evento JOIN já processado, ignorando...');
    }
  } catch (error) {
    console.error('Erro ao processar JOIN:', error);
  }
});

client.on('group_leave', async (notification) => {
  try {
    console.log('\nNotificação de LEAVE recebida:', notification);
    
    // Garantir recipientIds
    if (!notification.recipientIds || notification.recipientIds.length === 0) {
      console.log('Tentando extrair recipientId do id...');
      const match = notification.id._serialized.match(/\d+@c\.us/);
      if (match) {
        notification.recipientIds = [match[0]];
      }
    }

    // Garantir timestamp
    const timestamp = notification.timestamp || Math.floor(Date.now() / 1000);
    
    // Criar uma cópia da notificação com dados garantidos
    const processedNotification = {
      ...notification,
      timestamp: timestamp
    };

    await processGroupEvent(processedNotification, 'LEAVE');
  } catch (error) {
    console.error('Erro ao processar LEAVE:', error);
  }
});

// Adicionar evento para remoções
client.on('group_remove', async (notification) => {
  try {
    console.log('\nNotificação de REMOVE recebida:', notification);
    
    // Garantir timestamp
    const timestamp = notification.timestamp || Math.floor(Date.now() / 1000);
    
    // Criar uma cópia da notificação com timestamp garantido
    const processedNotification = {
      ...notification,
      timestamp: timestamp
    };

    await processGroupEvent(processedNotification, 'LEAVE');
  } catch (error) {
    console.error('Erro ao processar REMOVE:', error);
  }
});

// Adicionar evento do QR code
client.on('qr', async (qr) => {
  console.log('\n=== NOVO QR CODE GERADO ===');
  console.log('Data/Hora:', new Date().toLocaleString());
  console.log('Ambiente:', DEPLOY_ENV);
  
  // Gerar URLs do QR code
  const qrUrls = [
    `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`,
    `https://chart.googleapis.com/chart?cht=qr&chs=300x300&chl=${encodeURIComponent(qr)}`
  ];
  
  // Imprimir URLs
  console.log('\nQR Code disponível nas seguintes URLs:');
  qrUrls.forEach((url, index) => {
    console.log(`[${index + 1}] ${url}`);
  });

  // Gerar QR code no terminal
  try {
    console.log('\nQR Code em ASCII:');
    qrcode.generate(qr, { small: true });
  } catch (error) {
    console.error('Erro ao gerar QR code em ASCII:', error);
  }
  
  // Imprimir o QR code como texto
  console.log('\nQR Code como texto (para backup):');
  console.log(qr);
  
  // Salvar QR code em arquivo
  try {
    const qrLogPath = path.join(__dirname, 'qr-code.txt');
    fs.writeFileSync(qrLogPath, qr);
    console.log('\nQR Code salvo em:', qrLogPath);
  } catch (error) {
    console.error('Erro ao salvar QR code em arquivo:', error);
  }
  
  console.log('\nAguardando leitura do QR Code...');
  console.log('Você tem 60 segundos para escanear antes de um novo QR code ser gerado.');
});

// Adicionar eventos de autenticação
client.on('loading_screen', (percent, message) => {
  console.log('\n=== CARREGANDO ===');
  console.log('Progresso:', percent, '%');
  console.log('Mensagem:', message);
});

client.on('authenticated', () => {
  console.log('\n=== AUTENTICAÇÃO BEM-SUCEDIDA ===');
  console.log('Data/Hora:', new Date().toLocaleString());
});

client.on('auth_failure', (msg) => {
  console.error('\n=== FALHA NA AUTENTICAÇÃO ===');
  console.error('Data/Hora:', new Date().toLocaleString());
  console.error('Mensagem:', msg);
  
  // Tentar reconectar em caso de falha
  handleConnectionError(new Error('Falha na autenticação: ' + msg));
});

client.initialize();