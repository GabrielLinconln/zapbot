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
    
    // Tenta criar uma tabela de teste
    const testTableName = 'test_connection_' + Math.random().toString(36).substring(7);
    const { error: createError } = await supabase.rpc('exec_sql', {
      query: `
        CREATE TABLE IF NOT EXISTS "${testTableName}" (
          id SERIAL PRIMARY KEY,
          test_column TEXT
        );
      `
    });

    if (createError) {
      throw new Error(`Erro ao criar tabela de teste: ${createError.message}`);
    }

    console.log('Conexão com Supabase estabelecida com sucesso!');
    
    // Limpa a tabela de teste
    await supabase.rpc('exec_sql', {
      query: `DROP TABLE IF EXISTS "${testTableName}";`
    });
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

// Função para sanitizar o nome da tabela
function sanitizeTableName(groupName) {
  return groupName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_') // Substitui caracteres não alfanuméricos por _
    .replace(/_{2,}/g, '_')     // Remove underscores duplicados
    .replace(/^_|_$/g, '')      // Remove underscores no início e fim
    .substring(0, 50);          // Limita o tamanho do nome
}

// Função para registrar eventos no Supabase
async function recordEventSupabase(timestamp, eventType, user, group) {
  try {
    const tableName = `group_${sanitizeTableName(group)}`;
    console.log('\n=== Iniciando registro no Supabase ===');
    console.log('Tabela:', tableName);
    console.log('Dados:', { timestamp, eventType, user, group });
    
    // Verifica se a tabela existe e cria se necessário
    const { error: checkError } = await supabase
      .from(tableName)
      .select('id')
      .limit(1);

    if (checkError && checkError.code === '42P01') {
      console.log('Tabela não existe, criando...');
      const createTableQuery = `
        CREATE TABLE IF NOT EXISTS "${tableName}" (
          id SERIAL PRIMARY KEY,
          timestamp TIMESTAMP WITH TIME ZONE,
          event_type VARCHAR(10),
          user_id VARCHAR(255),
          group_name TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `;

      const { error: createError } = await supabase.rpc('exec_sql', {
        query: createTableQuery
      });

      if (createError) {
        console.error('Erro ao criar tabela:', createError);
        throw new Error(`Erro ao criar tabela: ${createError.message}`);
      }
      console.log('Tabela criada com sucesso!');
    }

    // Insere o registro na tabela
    console.log('Inserindo registro...');
    const { error: insertError } = await supabase
      .from(tableName)
      .insert([
        {
          timestamp: new Date(timestamp),
          event_type: eventType,
          user_id: user,
          group_name: group
        }
      ]);

    if (insertError) {
      console.error('Erro ao inserir:', insertError);
      throw insertError;
    }

    console.log('Registro inserido com sucesso!');
    console.log('=== Fim do registro no Supabase ===\n');
    return true;
  } catch (error) {
    console.error('\nERRO AO REGISTRAR NO SUPABASE:');
    console.error('Tipo:', error.name);
    console.error('Mensagem:', error.message);
    console.error('Stack:', error.stack);
    if (error.response) {
      console.error('Resposta:', error.response);
    }
    // Em caso de erro no Supabase, tenta registrar no Google Sheets como fallback
    console.log('Tentando fallback para Google Sheets...');
    return appendToSheet(timestamp, eventType, user, group);
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

async function getGroupName(client, groupId) {
  try {
    console.log('\n=== DEBUG: Obtendo nome do grupo ===');
    console.log('ID do grupo:', groupId);
    
    const chat = await client.getChatById(groupId);
    console.log('Chat obtido:', {
      id: chat.id,
      name: chat.name,
      isGroup: chat.isGroup,
      type: chat.id?.server // Verificando se é um grupo pelo server
    });

    // Se tem um nome e o ID termina com @g.us, é um grupo
    if (chat.name && groupId.endsWith('@g.us')) {
      console.log('Nome do grupo encontrado:', chat.name);
      return chat.name;
    }

    console.log('Não foi possível obter o nome do grupo');
    return 'Grupo não identificado';
  } catch (error) {
    console.error('Erro ao obter nome do grupo:', error);
    return 'Grupo não identificado';
  }
}

async function logEventToFile(eventType, user, group, providedTimestamp = null) {
  try {
    const timestamp = providedTimestamp || new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(new Date());
    
    let formattedUser = user;
    if (user.includes('@c.us')) {
      formattedUser = await getContactName(client, user);
    }
    
    // Registra no arquivo de log
    const logEntry = `${timestamp} - ${eventType} - Usuário(s): ${formattedUser} - Grupo: ${group}\n`;
    fs.appendFileSync(LOG_FILE, logEntry, 'utf8');
    console.log(`[LOG] Evento registrado no arquivo: ${logEntry.trim()}`);
    
    // Tenta registrar no Supabase primeiro
    try {
      await recordEventSupabase(timestamp, eventType, formattedUser, group);
    } catch (supabaseError) {
      console.error('Erro ao registrar no Supabase:', supabaseError);
      // Se falhar no Supabase, tenta registrar no Google Sheets
      await appendToSheet(timestamp, eventType, formattedUser, group);
    }
  } catch (error) {
    console.error('Erro ao registrar evento:', error);
    try {
      const errorEntry = `${new Date().toISOString()} - ERRO CRÍTICO - ${error.message}\n`;
      fs.appendFileSync(LOG_FILE, errorEntry, 'utf8');
    } catch (fsError) {
      console.error('Erro fatal ao registrar no arquivo de log:', fsError);
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
      '--no-zygote',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-software-rasterizer',
      '--ignore-certificate-errors',
      '--allow-running-insecure-content'
    ],
    headless: 'new',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
    timeout: 0
  },
  qrMaxRetries: 10,
  authTimeoutMs: 0,
  restartOnAuthFail: true,
  takeoverOnConflict: true,
  takeoverTimeoutMs: 0
});

// Adicionar logs para debug de inicialização
console.log('\n=== INICIANDO CLIENTE WHATSAPP ===');
console.log('Data/Hora:', new Date().toLocaleString());
console.log('Ambiente:', DEPLOY_ENV);
console.log('Diretório de trabalho:', process.cwd());
console.log('Puppeteer executable:', process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium');

client.on('qr', async (qr) => {
  console.log('\n=== NOVO QR CODE GERADO ===');
  console.log('Data/Hora:', new Date().toLocaleString());
  console.log('Ambiente:', DEPLOY_ENV);
  
  // Sempre gerar URLs do QR code primeiro
  const qrUrls = [
    `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`,
    `https://chart.googleapis.com/chart?cht=qr&chs=300x300&chl=${encodeURIComponent(qr)}`
  ];
  
  console.log('\nQR Code disponível nas seguintes URLs:');
  qrUrls.forEach((url, index) => {
    console.log(`[${index + 1}] ${url}`);
  });

  // Gerar QR code no terminal
  console.log('\nQR Code em ASCII:');
  qrcode.generate(qr, { small: true });
  
  // Imprimir o QR code como texto também
  console.log('\nQR Code como texto (para backup):');
  console.log(qr);
  
  console.log('\nAguardando leitura do QR Code...');
  console.log('Você tem 60 segundos para escanear antes de um novo QR code ser gerado.');
});

// Adicionar mais eventos para debug
client.on('loading_screen', (percent, message) => {
  console.log('CARREGANDO:', percent, '%', message);
});

client.on('authenticated', () => {
  console.log('\n=== AUTENTICAÇÃO BEM-SUCEDIDA ===');
  console.log('Data/Hora:', new Date().toLocaleString());
});

client.on('auth_failure', (msg) => {
  console.error('\n=== FALHA NA AUTENTICAÇÃO ===');
  console.error('Mensagem:', msg);
});

client.on('ready', async () => {
  console.log('\n=== CLIENTE WHATSAPP CONECTADO ===');
  console.log('Data/Hora:', new Date().toLocaleString());
  console.log('Ambiente:', DEPLOY_ENV);
  
  // Lista todos os chats para debug
  try {
    const chats = await client.getChats();
    console.log('\nGrupos disponíveis:');
    chats.forEach(chat => {
      if (chat.isGroup) {
        console.log({
          id: chat.id,
          name: chat.name,
          participants: chat.participants?.length || 0
        });
      }
    });
  } catch (error) {
    console.error('Erro ao listar chats:', error);
  }
});

client.on('group_join', async (notification) => {
  try {
    console.log('\nNOVO EVENTO DE ENTRADA NO GRUPO');
    console.log('Notification raw:', JSON.stringify(notification, null, 2));
    
    // Obtém o nome do grupo
    let groupName;
    try {
      console.log('Tentando obter chat...');
      const chat = await client.getChatById(notification.chatId);
      console.log('Chat obtido:', {
        id: chat.id,
        name: chat.name,
        isGroup: chat.isGroup
      });
      groupName = chat.name || 'Grupo não identificado';
      console.log('Nome do grupo:', groupName);
    } catch (chatError) {
      console.error('Erro ao obter chat:', chatError);
      groupName = 'Grupo não identificado';
    }
    
    // Obtém os nomes dos contatos
    console.log('Obtendo nomes dos contatos...');
    const userNames = await Promise.all(
      notification.recipientIds.map(async (userId) => {
        try {
          return await getContactName(client, userId);
        } catch (error) {
          console.error('Erro ao obter nome do contato:', error);
          return userId;
        }
      })
    );
    
    const userIdentifiers = userNames.join(', ');
    console.log('Usuários:', userIdentifiers);
    
    // Registra o evento
    console.log('Registrando evento...');
    await logEventToFile('JOIN', userIdentifiers, groupName);
    
    console.log('Evento de entrada processado com sucesso');
  } catch (error) {
    console.error('Erro ao processar entrada no grupo:', error);
  }
});

client.on('group_leave', async (notification) => {
  try {
    console.log('\nNOVO EVENTO DE SAÍDA DO GRUPO');
    console.log('Notification raw:', JSON.stringify(notification, null, 2));
    
    // Obtém o nome do grupo
    let groupName;
    try {
      console.log('Tentando obter chat...');
      const chat = await client.getChatById(notification.chatId);
      console.log('Chat obtido:', {
        id: chat.id,
        name: chat.name,
        isGroup: chat.isGroup
      });
      groupName = chat.name || 'Grupo não identificado';
      console.log('Nome do grupo:', groupName);
    } catch (chatError) {
      console.error('Erro ao obter chat:', chatError);
      groupName = 'Grupo não identificado';
    }
    
    // Obtém os nomes dos contatos
    console.log('Obtendo nomes dos contatos...');
    const userNames = await Promise.all(
      notification.recipientIds.map(async (userId) => {
        try {
          return await getContactName(client, userId);
        } catch (error) {
          console.error('Erro ao obter nome do contato:', error);
          return userId;
        }
      })
    );
    
    const userIdentifiers = userNames.join(', ');
    console.log('Usuários:', userIdentifiers);
    
    // Registra o evento
    console.log('Registrando evento...');
    await logEventToFile('LEAVE', userIdentifiers, groupName);
    
    console.log('Evento de saída processado com sucesso');
  } catch (error) {
    console.error('Erro ao processar saída do grupo:', error);
    console.error('Stack:', error.stack);
    
    // Tenta registrar mesmo com erro
    try {
      console.log('Tentando registro de fallback...');
      await logEventToFile(
        'LEAVE',
        notification.recipientIds.join(', '),
        notification.chatId
      );
    } catch (fallbackError) {
      console.error('Erro ao tentar registro de fallback:', fallbackError);
    }
  }
});

client.initialize();