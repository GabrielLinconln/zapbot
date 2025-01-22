const { Client } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const LOG_FILE = path.join(__dirname, 'log.txt');

// Adicionar configuração do Google Sheets
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1U7SzPTc2t8SIIcAubigz3oNMUEboDU8oxT5I0KkODq0';
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');

async function appendToSheet(timestamp, eventType, user, group) {
  try {
    console.log('\nIniciando registro na planilha...');
    
    // Lê as credenciais do arquivo
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    
    const auth = new google.auth.GoogleAuth({
      credentials: credentials, // Usa as credenciais do arquivo
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    
    // Dados a serem registrados
    const values = [
      [timestamp, user, group, eventType === 'JOIN' ? 'X' : '', eventType === 'LEAVE' ? 'X' : '']
    ];

    console.log('Tentando registrar valores:', values);

    // Tenta registrar diretamente
    const result = await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Registros!A:E',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: values
      }
    });

    console.log('Resposta da API:', {
      status: result.status,
      updatedRange: result.data?.updates?.updatedRange,
      updatedRows: result.data?.updates?.updatedRows
    });

  } catch (error) {
    console.error('\nERRO AO REGISTRAR NA PLANILHA');
    console.error('Erro completo:', error);
    
    // Tenta imprimir mais detalhes do erro
    if (error.response) {
      console.error('Resposta do erro:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
    }
  }
}

async function getContactName(client, userId) {
  try {
    const contact = await client.getContactById(userId);
    // Tenta obter o nome do contato de várias formas possíveis
    const name = contact.name || 
                contact.pushname || 
                contact.shortName || 
                contact.verifiedName;
    
    if (name) return name;
    
    // Se não encontrou nome, formata o número
    return userId
      .replace(/@c\.us/g, '')
      .replace(/^55/, '')
      .replace(/(\d{2})(\d{2})(\d{4,5})(\d{4})/, '$2 $3-$4');
  } catch (error) {
    console.error('Erro ao obter nome do contato:', error);
    // Formata o número se derro
    return userId
      .replace(/@c\.us/g, '')
      .replace(/^55/, '')
      .replace(/(\d{2})(\d{2})(\d{4,5})(\d{4})/, '$2 $3-$4');
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

async function logEventToFile(eventType, user, group) {
  try {
    const timestamp = new Date().toLocaleString();
    
    // Formata o usuário se necessário
    let formattedUser = user;
    if (user.includes('@c.us')) {
      formattedUser = await getContactName(client, user);
    }
    
    // Registra no arquivo
    const logEntry = `${timestamp} - ${eventType} - Usuário(s): ${formattedUser} - Grupo: ${group}\n`;
    fs.appendFileSync(LOG_FILE, logEntry, 'utf8');
    console.log(`[LOG] Evento registrado no arquivo: ${logEntry.trim()}`);
    
    // Registra na planilha
    await appendToSheet(timestamp, eventType, formattedUser, group);
  } catch (error) {
    console.error('Erro ao registrar evento:', error);
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
      '--single-process', // <- este não funciona no Windows
      '--disable-gpu'
    ],
    headless: true
  },
  qrMaxRetries: 5,
  authTimeoutMs: 0,
  restartOnAuthFail: true
});

client.on('qr', (qr) => {
  // Gera um QR code mais legível com caracteres ASCII maiores
  qrcode.generate(qr, { small: false });
  
  // Gera uma URL alternativa para o QR code
  console.log('\n=================================');
  console.log('QR Code alternativo disponível em:');
  console.log(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`);
  console.log('=================================\n');
  
  // Salva o QR code em um arquivo de texto para referência
  const qrLogPath = path.join(__dirname, 'qr-code.txt');
  fs.writeFileSync(qrLogPath, qr);
  console.log('QR Code também foi salvo em:', qrLogPath);
});

client.on('ready', async () => {
  console.log('Cliente WhatsApp conectado.');
  
  // Lista todos os chats para debug
  try {
    const chats = await client.getChats();
    console.log('\nChats disponíveis:');
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
    const groupName = await getGroupName(client, notification.chatId);
    
    // Obtém os nomes dos contatos
    const userNames = await Promise.all(
      notification.recipientIds.map(userId => getContactName(client, userId))
    );
    
    const userIdentifiers = userNames.join(', ');
    await logEventToFile('JOIN', userIdentifiers, groupName);
  } catch (error) {
    console.error('Erro ao processar entrada no grupo:', error);
  }
});

client.on('group_leave', async (notification) => {
  try {
    console.log('\nNOVO EVENTO DE SAÍDA DO GRUPO');
    console.log('Notification raw:', JSON.stringify(notification, null, 2));
    
    // Obtém o nome do grupo
    const groupName = await getGroupName(client, notification.chatId);
    
    // Obtém os nomes dos contatos
    const userNames = await Promise.all(
      notification.recipientIds.map(userId => getContactName(client, userId))
    );
    
    const userIdentifiers = userNames.join(', ');
    await logEventToFile('LEAVE', userIdentifiers, groupName);
  } catch (error) {
    console.error('Erro ao processar saída do grupo:', error);
  }
});

client.initialize();
