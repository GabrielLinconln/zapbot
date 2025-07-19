require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');
const http = require('http');
const qrcode_lib = require('qrcode');
const dns = require('dns');

const LOG_FILE = path.join(__dirname, 'log.txt');
const QR_FILE = path.join(__dirname, 'qr-code.txt');
const QR_IMG_FILE = path.join(__dirname, 'qr-code.png');
const SESSION_PATH = path.join(__dirname, '.wwebjs_auth/session');
const DEPLOY_ENV = process.env.DEPLOY_ENV || 'local';
const PORT = process.env.PORT || 3000;

// Definir timeout para DNS (ajuda com problemas de DNS em ambientes cloud)
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '1.1.1.1', '208.67.222.222']);

// Criar servidor HTTP simples para exibir QR code
const server = http.createServer((req, res) => {
  if (req.url === '/') {
    if (fs.existsSync(QR_IMG_FILE)) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>WhatsApp Bot QR Code</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: Arial, sans-serif; text-align: center; margin: 20px; }
            img { max-width: 300px; border: 1px solid #ddd; margin: 20px auto; display: block; }
            .container { max-width: 600px; margin: 0 auto; }
            .refresh { margin-top: 20px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>WhatsApp Bot - QR Code</h1>
            <p>Escaneie o QR code abaixo com seu WhatsApp para autenticar o bot</p>
            <img src="/qrcode" alt="QR Code">
            <p class="refresh">Esta página atualiza automaticamente a cada 30 segundos</p>
            <p>Última atualização: ${new Date().toLocaleString('pt-BR')}</p>
          </div>
          <script>
            setTimeout(() => { window.location.reload(); }, 30000);
          </script>
        </body>
        </html>
      `);
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>WhatsApp Bot QR Code</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: Arial, sans-serif; text-align: center; margin: 20px; }
            .container { max-width: 600px; margin: 0 auto; }
            .refresh { margin-top: 20px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>WhatsApp Bot - QR Code</h1>
            <p>Aguardando geração do QR code...</p>
            <p>Esta página atualiza automaticamente a cada 10 segundos</p>
            <p>Última atualização: ${new Date().toLocaleString('pt-BR')}</p>
          </div>
          <script>
            setTimeout(() => { window.location.reload(); }, 10000);
          </script>
        </body>
        </html>
      `);
    }
  } else if (req.url === '/qrcode' && fs.existsSync(QR_IMG_FILE)) {
    res.writeHead(200, { 'Content-Type': 'image/png' });
    fs.createReadStream(QR_IMG_FILE).pipe(res);
  } else if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: DEPLOY_ENV,
      whatsapp_ready: isClientReady,
      qrcode_available: fs.existsSync(QR_IMG_FILE),
      auth_in_progress: authInProgress,
      error_count: errorCount || 0,
      uptime: process.uptime()
    }));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

// Iniciar servidor
server.listen(PORT, () => {
  console.log(`\n=== SERVIDOR HTTP INICIADO ===`);
  console.log(`🌐 Porta: ${PORT}`);
  console.log(`🔧 Ambiente: ${DEPLOY_ENV}`);
  console.log(`📱 Acesse a URL do EasyPanel para ver o QR code`);
  console.log(`❤️ Health check disponível em /health`);
  console.log(`⏰ Processo iniciado em: ${new Date().toLocaleString('pt-BR')}`);
});

// Mapear domínios conhecidos para IPs (solução para problemas de DNS)
const knownHosts = {
  'qlqvpfdskgnlndxokztf.supabase.co': '104.18.11.143' // IP do Supabase, pode precisar ser atualizado se mudar
};

// Função auxiliar para obter URL com IP direto
function getDirectIpUrl(originalUrl) {
  try {
    if (!originalUrl) return null;
    
    const url = new URL(originalUrl);
    const hostname = url.hostname;
    
    if (knownHosts[hostname]) {
      // Substituir pelo IP conhecido
      console.log(`Usando IP direto (${knownHosts[hostname]}) para ${hostname}`);
      
      // Construir nova URL com IP
      const ipUrl = new URL(originalUrl);
      ipUrl.hostname = knownHosts[hostname];
      
      // Adicionar header Host original para evitar problemas de certificado/routing
      return {
        url: ipUrl.toString(),
        headers: { 'Host': hostname }
      };
    }
    
    return null;
  } catch (error) {
    console.error('Erro ao processar URL para IP direto:', error);
    return null;
  }
}

// Inicialização do cliente Supabase
console.log('\n=== Verificando configuração do Supabase ===');
const supabaseUrl = process.env.SUPABASE_URL?.trim();
const supabaseKey = process.env.SUPABASE_KEY?.trim();

// Verificar e limpar possíveis problemas com as variáveis de ambiente
let cleanSupabaseUrl = supabaseUrl;
let cleanSupabaseKey = supabaseKey;

// Verificar se a URL ou Key tem aspas ou espaços extras (problema comum no Railway)
if (supabaseUrl && (supabaseUrl.startsWith('"') || supabaseUrl.startsWith("'"))) {
  cleanSupabaseUrl = supabaseUrl.replace(/^['"]|['"]$/g, '').trim();
  console.log('AVISO: Removidas aspas da URL Supabase. Verifique a configuração no Railway.');
}

if (supabaseKey && (supabaseKey.startsWith('"') || supabaseKey.startsWith("'"))) {
  cleanSupabaseKey = supabaseKey.replace(/^['"]|['"]$/g, '').trim();
  console.log('AVISO: Removidas aspas da Key Supabase. Verifique a configuração no Railway.');
}

// Se as variáveis foram limpas, mostrar os novos valores (primeiros caracteres)
if (cleanSupabaseUrl !== supabaseUrl || cleanSupabaseKey !== supabaseKey) {
  console.log('URL limpa:', cleanSupabaseUrl ? cleanSupabaseUrl.substring(0, 30) + '...' : 'Ausente');
  console.log('Key limpa:', cleanSupabaseKey ? 'Presente (começa com: ' + cleanSupabaseKey.substring(0, 10) + '...)' : 'Ausente');
} else {
  console.log('URL configurada:', supabaseUrl);
  console.log('Key configurada:', supabaseKey ? 'Presente (começa com: ' + supabaseKey.substring(0, 10) + '...)' : 'Ausente');
}

// Tentar criar uma alternativa com IP direto
let directIpConfig = null;
if (cleanSupabaseUrl) {
  directIpConfig = getDirectIpUrl(cleanSupabaseUrl);
  if (directIpConfig) {
    console.log('URL alternativa com IP direto:', directIpConfig.url);
  }
}

if (!cleanSupabaseUrl || !cleanSupabaseKey) {
  console.error('Erro: Credenciais do Supabase não encontradas no .env');
  console.log('Continuando sem Supabase, usando fallback...');
}

// Personalizar fetch para usar IP direto quando necessário
const customFetch = function(url, options) {
  const originalUrl = url.toString();
  
  // Verificar se é uma URL para o Supabase
  if (cleanSupabaseUrl && originalUrl.includes(new URL(cleanSupabaseUrl).hostname)) {
    if (directIpConfig) {
      const newUrl = originalUrl.replace(cleanSupabaseUrl, directIpConfig.url);
      const newOptions = {
        ...options,
        headers: {
          ...options?.headers,
          ...directIpConfig.headers
        }
      };
      
      console.log(`Usando IP direto para request: ${newUrl}`);
      return fetch(newUrl, newOptions);
    }
  }
  
  // Fallback para o fetch normal
  return fetch(url, options);
};

const supabase = createClient(cleanSupabaseUrl || 'https://example.com', cleanSupabaseKey || 'fallback-key', {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false
  },
  global: {
    headers: {
      'Authorization': `Bearer ${cleanSupabaseKey || 'fallback-key'}`
    },
    fetch: customFetch
  }
});

// Função para resolver hostname (teste DNS)
async function resolveHostname(hostname) {
  try {
    console.log(`Tentando resolver DNS para ${hostname}...`);
    return new Promise((resolve, reject) => {
      dns.lookup(hostname, (err, address) => {
        if (err) {
          console.error(`Erro ao resolver ${hostname}:`, err);
          reject(err);
        } else {
          console.log(`${hostname} resolvido para ${address}`);
          resolve(address);
        }
      });
    });
  } catch (error) {
    console.error(`Falha ao resolver ${hostname}:`, error);
    throw error;
  }
}

// Teste de conexão inicial com retry
async function testSupabaseConnection(retries = 5, initialDelay = 1000) {
  let currentRetry = 0;
  let delay = initialDelay;

  while (currentRetry < retries) {
    try {
      console.log(`\nTestando conexão com Supabase (tentativa ${currentRetry + 1}/${retries})...`);
      
      // Primeiro, verificar se conseguimos resolver o hostname
      if (cleanSupabaseUrl) {
        try {
          const hostname = new URL(cleanSupabaseUrl).hostname;
          await resolveHostname(hostname);
        } catch (dnsError) {
          console.error('Erro de DNS ao resolver hostname do Supabase:', dnsError);
          console.log('Tentando conexão mesmo assim...');
        }
      }
      
      // Abordagem direta: verificar se a tabela whatsapp_events existe
      try {
        // Usar RPC personalizado para teste simples
        const { data, error } = await supabase.rpc('ping', {});
          
        if (error) {
          // Se for erro de função não existente, criar uma função simples
          if (error.code === '42883') { // função inexistente
            console.log('Função de ping não existe. Tentando método alternativo...');
            
            // Tentar verificar diretamente a tabela whatsapp_events
            const { error: tableError } = await supabase
              .from('whatsapp_events')
              .select('id')
              .limit(1);
              
            if (tableError) {
              // Se a tabela não existir, verificamos o tipo de erro
              if (tableError.code === '42P01') {
                console.log('Tabela whatsapp_events não existe. Verificando conexão geral...');
                
                // Verificar se podemos obter a hora do servidor (essa operação geralmente funciona independente das permissões)
                const { data: timeData, error: timeError } = await supabase.rpc('get_current_timestamp');
                
                if (timeError) {
                  // Se nem isso funcionar, então tentamos um fallback final
                  if (timeError.code === '42883') {
                    console.log('Tentando verificação final de conexão...');
                    
                    // Usar uma query simples que qualquer usuário com permissão mínima pode executar
                    const { data: versionData, error: versionError } = await supabase.auth.getSession();
                    
                    if (versionError) {
                      console.error('Erro na verificação final:', versionError);
                      throw new Error('Falha na conexão com o Supabase');
                    } else {
                      console.log('Conexão com Supabase estabelecida (verificação básica)');
                      console.log('IMPORTANTE: É necessário criar a tabela whatsapp_events no Supabase');
                    }
                  } else {
                    console.error('Erro ao verificar timestamp:', timeError);
                    throw new Error('Erro de conexão ou permissão');
                  }
                } else {
                  console.log('Conexão com Supabase estabelecida com sucesso!');
                  console.log('IMPORTANTE: É necessário criar a tabela whatsapp_events no Supabase');
                }
              } else {
                console.error('Erro inesperado ao acessar a tabela:', tableError);
                throw new Error('Erro de conexão ou permissão');
              }
            } else {
              console.log('Conexão com Supabase estabelecida com sucesso!');
              console.log('Tabela whatsapp_events encontrada e pronta para uso.');
            }
          } else {
            console.error('Erro inesperado na função ping:', error);
            throw new Error('Erro de conexão ou permissão');
          }
        } else {
          console.log('Conexão com Supabase estabelecida com sucesso (ping)!');
        }
        
        return; // Sucesso, sair da função
      } catch (innerError) {
        console.log('Erro na conexão com Supabase:', innerError.message);
        throw innerError; // Propagar para o retry
      }
    } catch (error) {
      currentRetry++;
      if (currentRetry >= retries) {
        console.error(`\nFalha em todas as ${retries} tentativas de conexão com Supabase.`);
        console.error('Detalhes do último erro:', error);
        console.log('\n### IMPORTANTE: CONFIGURAÇÃO SUPABASE ###');
        console.log('1. Verifique se as variáveis de ambiente do Supabase estão configuradas corretamente no Railway');
        console.log('2. Use a chave "service_role" do Supabase para maior permissão (não a anon/public key)');
        console.log('3. Execute o script create_table_simple.sql no SQL Editor do Supabase para criar a tabela');
        console.log('4. Sem isso, os eventos serão registrados apenas em logs locais');
        console.log('\nContinuando execução do bot com logs locais...');
        return;
      }
      
      console.log(`\nTentativa ${currentRetry} falhou. Tentando novamente em ${delay/1000} segundos...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2; // Exponential backoff
    }
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
    // Se já for um objeto Date, converte para formato Brasília
    if (dateStr instanceof Date) {
      return new Date(dateStr.toLocaleString('en-US', {
        timeZone: 'America/Sao_Paulo'
      })).toISOString();
    }

    // Converte string de data BR para formato ISO
    const [datePart, timePart] = dateStr.split(', ');
    const [day, month, year] = datePart.split('/');
    const [hour, minute, second] = timePart ? timePart.split(':') : ['00', '00', '00'];
    
    // Criar data especificando o fuso horário de Brasília
    const dateOptions = { 
      year: parseInt(year), 
      month: parseInt(month) - 1, 
      day: parseInt(day), 
      hour: parseInt(hour), 
      minute: parseInt(minute), 
      second: parseInt(second),
      timeZone: 'America/Sao_Paulo'
    };
    
    // Criar data no fuso de Brasília
    const brasiliaDate = new Date(Date.UTC(
      dateOptions.year,
      dateOptions.month,
      dateOptions.day,
      dateOptions.hour,
      dateOptions.minute,
      dateOptions.second
    ));
    
    // Ajustar o offset do timezone para Brasília (GMT-3)
    const brasiliaOffset = -3 * 60 * 60 * 1000; // -3 horas em milissegundos
    const utcTime = brasiliaDate.getTime();
    const localTime = utcTime - brasiliaOffset;
    
    // Retornar a data ISO com timezone embutido
    return new Date(localTime).toISOString();
  } catch (error) {
    console.error('Erro ao formatar data:', error);
    // Em caso de erro, retorna a data atual no horário de Brasília
    return new Date(new Date().toLocaleString('en-US', {
      timeZone: 'America/Sao_Paulo'
    })).toISOString();
  }
}

// Adicionar cache de eventos pendentes
const pendingEvents = [];
const MAX_PENDING_EVENTS = 100;

// Salvar eventos pendentes periodicamente
setInterval(async () => {
  if (pendingEvents.length > 0) {
    console.log(`\n=== Processando ${pendingEvents.length} eventos pendentes ===`);
    
    // Cópia dos eventos para processar
    const eventsToProcess = [...pendingEvents];
    
    // Limpar a lista original para evitar duplicações
    pendingEvents.length = 0;
    
    // Processar cada evento pendente
    for (const event of eventsToProcess) {
      try {
        const success = await recordEventSupabase(
          event.timestamp, 
          event.eventType, 
          event.user, 
          event.group
        );
        
        if (success) {
          console.log(`Evento pendente processado com sucesso: ${event.eventType} - ${event.user}`);
        } else {
          // Se ainda falhar, adicionar de volta à fila se não exceder o limite
          if (pendingEvents.length < MAX_PENDING_EVENTS) {
            pendingEvents.push(event);
            console.log(`Evento adicionado novamente à fila para nova tentativa: ${event.eventType} - ${event.user}`);
          } else {
            console.error(`Limite de eventos pendentes excedido, evento perdido: ${event.eventType} - ${event.user}`);
          }
        }
      } catch (error) {
        console.error(`Erro ao processar evento pendente:`, error);
        // Adicionamos de volta à fila apenas se for um erro temporário
        if (pendingEvents.length < MAX_PENDING_EVENTS && 
            (error.message.includes('conexão') || error.message.includes('connection'))) {
          pendingEvents.push(event);
        }
      }
    }
  }
}, 60000); // Verificar a cada 1 minuto

// Função para registrar eventos no Supabase
async function recordEventSupabase(timestamp, eventType, user, group) {
  console.log('\n=== Iniciando registro no Supabase ===');
  console.log('Dados a registrar:', { timestamp, eventType, user, group });
  
  try {
    // Validar dados de entrada
    if (!timestamp || !eventType || !user || !group) {
      throw new Error('Dados incompletos para registro');
    }

    // Garantir que o timestamp seja válido e convertido para horário de Brasília
    let date;
    if (timestamp instanceof Date) {
      date = timestamp;
    } else if (typeof timestamp === 'number') {
      date = new Date(timestamp * 1000);
    } else {
      try {
        // Tenta converter string para data
        const parsedDate = new Date(timestamp);
        if (isNaN(parsedDate.getTime())) {
          // Se falhar, tenta usar o formatDateForSupabase
          date = new Date(formatDateForSupabase(timestamp));
        } else {
          date = parsedDate;
        }
      } catch (error) {
        console.error('Erro ao converter timestamp:', error);
        date = new Date(); // Usa data atual como fallback
      }
    }
    
    // Converter para string ISO no formato de Brasília
    const brasiliaTimestamp = new Date(date.toLocaleString('en-US', {
      timeZone: 'America/Sao_Paulo'
    })).toISOString();
    
    let formattedTimestamp = brasiliaTimestamp;
    
    // Validar timestamp formatado
    if (!Date.parse(formattedTimestamp)) {
      console.error('Timestamp inválido:', formattedTimestamp);
      // Fallback para horário atual em Brasília
      formattedTimestamp = new Date(new Date().toLocaleString('en-US', {
        timeZone: 'America/Sao_Paulo'
      })).toISOString();
    }
    
    console.log('Timestamp formatado (Brasília):', formattedTimestamp);

    // Nome da tabela única para todos os eventos
    const tableName = 'whatsapp_events';

    // Extrair ID do grupo da string completa (se disponível)
    const groupId = group.includes('@g.us') ? group : 'unknown';
    
    // Sanitizar dados para o event_key
    const sanitizedUser = user.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
    const sanitizedTimestamp = formattedTimestamp.replace(/[^0-9]/g, '');
    
    // Gerar event_key único e determinístico
    const eventKey = `${sanitizedUser}_${eventType}_${groupId}_${sanitizedTimestamp}`;
    console.log('Event Key gerado:', eventKey);

    // Inserir o registro na tabela única usando a API nativa do Supabase
    const { data, error } = await supabase
      .from(tableName)
      .insert({
        timestamp: formattedTimestamp,
        event_type: eventType,
        user_id: user,
        group_id: groupId,
        group_name: group,
        event_key: eventKey
      })
      .select()
      .single();

    if (error) {
      // Verificar se é erro de chave duplicada (evento já registrado)
      if (error.code === '23505') {
        console.log('Evento já registrado (chave duplicada)');
        return false;
      }
      
      // Verificar se tabela não existe
      if (error.code === '42P01') {
        console.log('Tabela não existe, criando tabela...');
        
        // Tentamos criar a tabela diretamente via SQL Editor
        console.error('A tabela whatsapp_events precisa ser criada manualmente.');
        console.error('Acesse o Supabase SQL Editor e execute o arquivo create_table_simple.sql');
        
        // Vamos tentar ainda salvar o evento em um log local
        const errorLog = `${new Date().toISOString()} - ERRO TABELA - Evento não registrado no Supabase - ${eventType} - ${user} - ${group}\n`;
        fs.appendFileSync(LOG_FILE, errorLog, 'utf8');
        
        // Retornamos false, mas não travamos o fluxo para permitir que o bot continue funcionando
        console.log('Continuando execução do bot mesmo sem tabela...');
        return false;
      }
      
      console.error('Erro na inserção:', error);
      throw error;
    }

    console.log('Registro inserido com sucesso!');
    console.log('Dados:', data);
    return true;
  } catch (error) {
    console.error('Erro ao registrar no Supabase:', error);
    if (error.details) console.error('Detalhes:', error.details);
    if (error.hint) console.error('Dica:', error.hint);
    throw error;
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
      // Tentar registrar no Supabase
      await recordEventSupabase(timestamp, eventType, user, group);
      console.log('Evento registrado com sucesso no Supabase!');
    } catch (error) {
      console.error('Erro ao registrar no Supabase:', error);
      
      // Adicionar à fila de eventos pendentes para tentar novamente depois
      if (pendingEvents.length < MAX_PENDING_EVENTS) {
        pendingEvents.push({ timestamp, eventType, user, group });
        console.log('Evento adicionado à fila para processamento posterior');
      } else {
        console.error(`Limite de eventos pendentes excedido, evento perdido: ${eventType} - ${user}`);
      }
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

// Variáveis de controle da sessão
let isClientReady = false;
let qrCodeGenerated = false;
let authInProgress = false;

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
      '--allow-file-access-from-files',
      '--no-zygote',
      '--js-flags="--max-old-space-size=512"',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=TranslateUI',
      '--disable-ipc-flooding-protection',
      '--disable-hang-monitor',
      '--disable-client-side-phishing-detection',
      '--disable-component-update',
      '--no-default-browser-check',
      '--no-pings',
      '--media-cache-size=0',
      '--disk-cache-size=0',
      '--aggressive-cache-discard'
    ],
    headless: true,
    executablePath: process.platform === 'win32' 
      ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
      : process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : '/usr/bin/google-chrome-stable',
    timeout: 300000, // 5 minutos para permitir carregamento lento
    defaultViewport: {
      width: 1280,
      height: 720
    },
    ignoreHTTPSErrors: true,
    protocolTimeout: 300000, // 5 minutos
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false
  },
  authStrategy: new LocalAuth({
    clientId: "whatsapp-bot-production",
    dataPath: SESSION_PATH
  }),
  qrMaxRetries: 5, // Aumentado para dar mais chances
  authTimeoutMs: 300000, // 5 minutos
  restartOnAuthFail: false,
  takeoverOnConflict: true,
  takeoverTimeoutMs: 300000,
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
});

// Sistema de recuperação inteligente
let lastError = null;
let errorCount = 0;
const MAX_ERRORS = 3;

async function handleConnectionError(error) {
  console.error('\n=== ERRO DE CONEXÃO DETECTADO ===');
  console.error('Tipo:', error.name);
  console.error('Mensagem:', error.message);
  
  errorCount++;
  lastError = error;
  
  // Reset das flags de estado
  isClientReady = false;
  qrCodeGenerated = false;
  authInProgress = false;
  
  if (errorCount >= MAX_ERRORS) {
    console.error(`\n❌ Muitos erros consecutivos (${errorCount}). Reiniciando processo...`);
    console.error('O container será reiniciado automaticamente pelo EasyPanel.');
    process.exit(1);
  }
  
  console.log(`\n🔄 Tentativa de recuperação ${errorCount}/${MAX_ERRORS} em 30 segundos...`);
  
  setTimeout(async () => {
    try {
      console.log('Destruindo cliente atual...');
      await client.destroy();
      
      console.log('Aguardando limpeza...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      console.log('Reinicializando cliente...');
      await client.initialize();
      
      console.log('✅ Cliente reinicializado com sucesso!');
    } catch (reconnectError) {
      console.error('❌ Falha na reinicialização:', reconnectError);
      handleConnectionError(reconnectError);
    }
  }, 30000);
}

// Adicionar logs para debug de inicialização
console.log('\n=== INICIANDO CLIENTE WHATSAPP ===');
console.log('Data/Hora:', new Date().toLocaleString());
console.log('Ambiente:', DEPLOY_ENV);
console.log('Diretório de trabalho:', process.cwd());
console.log('Chrome executable:', process.platform === 'win32' 
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : '/usr/bin/google-chrome-stable');

// Verificar se o executável do Chrome existe
try {
  const chromePath = process.platform === 'win32' 
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
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
  isClientReady = false;
  qrCodeGenerated = false;
  authInProgress = false;
  
  // Verificar se foi uma desconexão inesperada
  if (reason !== 'LOGOUT' && reason !== 'NAVIGATION') {
    console.log('🔄 Desconexão inesperada detectada. Tentando recuperar...');
    handleConnectionError(new Error(`Cliente desconectado: ${reason}`));
  } else {
    console.log('ℹ️ Desconexão normal. Aguardando...');
  }
});

// Adicionar handler para erros do Puppeteer/Chrome
client.on('change_state', state => {
  console.log('📱 Estado do WhatsApp:', state);
});

// Capturar erros não tratados do cliente
process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Erro não tratado detectado:', reason);
  
  // Se for um erro relacionado ao protocol/session
  if (reason && reason.message && 
      (reason.message.includes('Protocol error') || 
       reason.message.includes('Session closed') ||
       reason.message.includes('Target closed'))) {
    console.error('🔧 Erro de protocolo detectado. Tentando recuperar...');
    handleConnectionError(reason);
  }
});

client.on('ready', async () => {
  console.log('\n=== CLIENTE WHATSAPP CONECTADO COM SUCESSO ===');
  console.log('Data/Hora:', new Date().toLocaleString());
  console.log('Ambiente:', DEPLOY_ENV);
  
  // Reset completo do estado
  isClientReady = true;
  qrCodeGenerated = false;
  authInProgress = false;
  errorCount = 0; // Reset contador de erros
  lastError = null;
  
  // Limpar arquivos de QR code após conexão bem-sucedida
  try {
    if (fs.existsSync(QR_IMG_FILE)) {
      fs.unlinkSync(QR_IMG_FILE);
      console.log('QR Code image removido após conexão.');
    }
    if (fs.existsSync(QR_FILE)) {
      fs.unlinkSync(QR_FILE);
      console.log('QR Code texto removido após conexão.');
    }
  } catch (error) {
    console.error('Erro ao remover arquivos de QR Code:', error);
  }
  
  console.log('🎉 Bot pronto para monitorar grupos!');
  console.log('✅ Sessão autenticada e estável');
  console.log('✅ Contador de erros resetado');
});

client.on('authenticated', () => {
  console.log('\n=== AUTENTICAÇÃO BEM-SUCEDIDA ===');
  console.log('Data/Hora:', new Date().toLocaleString());
  authInProgress = false;
  console.log('✅ WhatsApp autenticado com sucesso!');
});

client.on('auth_failure', (msg) => {
  console.error('\n=== FALHA NA AUTENTICAÇÃO ===');
  console.error('Data/Hora:', new Date().toLocaleString());
  console.error('Mensagem:', msg);
  
  isClientReady = false;
  qrCodeGenerated = false;
  authInProgress = false;
  
  console.log('❌ Autenticação falhou. QR Code será gerado novamente se necessário.');
});

// Monitor de status do cliente (sem reconexão automática)
setInterval(() => {
  try {
    if (isClientReady && client.info) {
      console.log('✅ Status: Cliente WhatsApp ativo e estável');
    } else if (!isClientReady) {
      console.log('⏳ Status: Aguardando autenticação do WhatsApp');
    }
  } catch (error) {
    console.error('Erro ao verificar status:', error);
  }
}, 10 * 60 * 1000); // Verificar a cada 10 minutos

// Adicionar um limpador de cache periódico (a cada 6 horas)
const CACHE_CLEANUP_INTERVAL = 6 * 60 * 60 * 1000; // 6 horas

setInterval(async () => {
  try {
    console.log('\n=== INICIANDO LIMPEZA DE CACHE ===');
    const page = client.pupPage;
    if (page) {
      // Limpar cookies e cache
      const cdpSession = await page.target().createCDPSession();
      await cdpSession.send('Network.clearBrowserCookies');
      await cdpSession.send('Network.clearBrowserCache');
      console.log('Cache do navegador limpo com sucesso');
    }
  } catch (error) {
    console.error('Erro ao limpar cache:', error);
  }
}, CACHE_CLEANUP_INTERVAL);

// Gerenciamento gracioso de sinais do sistema
let isShuttingDown = false;

process.on('SIGTERM', async () => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  console.log('\n⚠️ SIGTERM recebido - EasyPanel está reiniciando o container');
  console.log('Tentando manter sessão ativa...');
  
  // NÃO destruir o cliente para manter a sessão
  isClientReady = false;
  
  // Dar tempo para o WhatsApp salvar a sessão
  setTimeout(() => {
    console.log('Encerrando processo após preservar sessão...');
    process.exit(0);
  }, 5000);
});

process.on('SIGINT', async () => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  console.log('\n🛑 SIGINT recebido - Encerramento manual');
  isClientReady = false;
  
  try {
    console.log('Destruindo cliente WhatsApp...');
    await client.destroy();
  } catch (error) {
    console.error('Erro ao destruir cliente:', error);
  }
  
  process.exit(0);
});

// Ignorar outros sinais que podem causar restart
process.on('SIGHUP', () => {
  console.log('📡 SIGHUP ignorado - mantendo sessão ativa');
});

process.on('SIGUSR1', () => {
  console.log('📡 SIGUSR1 ignorado - mantendo sessão ativa');
});

process.on('SIGUSR2', () => {
  console.log('📡 SIGUSR2 ignorado - mantendo sessão ativa');
});

// Cache global para eventos processados
const processedEvents = new Set();

// Adicionar sistema de limitação de processamento para controlar picos de CPU
const MAX_CONCURRENT_PROCESSING = 2;
let currentProcessing = 0;
const processingQueue = [];

// Função para processar eventos com limitação
async function processWithLimit(fn, ...args) {
  if (currentProcessing >= MAX_CONCURRENT_PROCESSING) {
    console.log(`Limite de processamento atingido (${currentProcessing}/${MAX_CONCURRENT_PROCESSING}), adicionando à fila...`);
    // Adiciona à fila para processamento posterior
    return new Promise(resolve => {
      processingQueue.push(() => {
        fn(...args).then(resolve);
      });
    });
  }
  
  currentProcessing++;
  try {
    return await fn(...args);
  } finally {
    currentProcessing--;
    if (processingQueue.length > 0 && currentProcessing < MAX_CONCURRENT_PROCESSING) {
      console.log(`Processando próximo evento da fila (${processingQueue.length} restantes)`);
      const nextProcess = processingQueue.shift();
      nextProcess();
    }
  }
}

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

    // Criar timestamp no formato brasileiro (usado nos logs e no Supabase)
    const brTimestamp = new Date(timestamp * 1000).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo'
    });

    // Para Supabase: criar uma data específica no fuso de Brasília
    const brasiliaDate = new Date(new Date(timestamp * 1000).toLocaleString('en-US', {
      timeZone: 'America/Sao_Paulo'
    }));
    
    // Log local primeiro
    const logEntry = `${brTimestamp} - ${eventType} - Usuário(s): ${userName} - Grupo: ${groupName}\n`;
    await fs.promises.appendFile(LOG_FILE, logEntry);

    // Registrar no Supabase (usando o timestamp de Brasília)
    try {
      // Passar o objeto Date no fuso de Brasília para garantir o horário correto
      const success = await recordEventSupabase(brasiliaDate, eventType, userName, groupName);
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
      await processWithLimit(processGroupEvent, processedNotification, 'JOIN');
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

    await processWithLimit(processGroupEvent, processedNotification, 'LEAVE');
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

    await processWithLimit(processGroupEvent, processedNotification, 'LEAVE');
  } catch (error) {
    console.error('Erro ao processar REMOVE:', error);
  }
});

// Adicionar evento do QR code com controle de duplicatas
client.on('qr', async (qr) => {
  // Verificar se já estamos autenticados ou se um QR já foi gerado recentemente
  if (isClientReady) {
    console.log('⚠️ QR Code ignorado - cliente já está pronto e conectado');
    return;
  }
  
  if (qrCodeGenerated && !authInProgress) {
    console.log('⚠️ QR Code ignorado - aguardando autenticação do QR anterior');
    return;
  }
  
  console.log('\n=== NOVO QR CODE GERADO ===');
  console.log('Data/Hora:', new Date().toLocaleString());
  console.log('Ambiente:', DEPLOY_ENV);
  
  qrCodeGenerated = true;
  authInProgress = true;
  
  // Gerar URLs do QR code
  const qrUrls = [
    `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`,
    `https://chart.googleapis.com/chart?cht=qr&chs=300x300&chl=${encodeURIComponent(qr)}`
  ];
  
  // Imprimir URLs
  console.log('\n### INSTRUÇÕES PARA AUTENTICAÇÃO ###');
  console.log('1. Abra uma das URLs abaixo em seu navegador para ver o QR code:');
  qrUrls.forEach((url, index) => {
    console.log(`   ${String.fromCharCode(97 + index)}) ${url}`);
  });
  
  console.log('\n2. OU acesse a URL do seu deploy no Railway (em Settings > Domains)');
  console.log(`   Use o endereço http://SEU-DOMINIO-RAILWAY para ver o QR code na web`);
  
  console.log('\n3. OU abra qualquer gerador de QR code online e cole o código abaixo:');
  console.log(`   ${qr}`);
  
  // Gerar base64 do QR code para inclusão em HTML
  try {
    const qrBase64 = await qrcode_lib.toDataURL(qr, {
      scale: 8,
      margin: 4,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });
    
    console.log('\n4. OU use esta imagem base64 para criar seu próprio HTML:');
    console.log(`   <img src="${qrBase64}" alt="QR Code" />`);
    
    // Criar um HTML simples para facilitar o uso
    const htmlQR = `
<!DOCTYPE html>
<html>
<head>
  <title>QR Code WhatsApp</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: Arial, sans-serif; text-align: center; margin: 20px; }
    img { max-width: 300px; border: 1px solid #ddd; margin: 20px auto; display: block; }
    .container { max-width: 600px; margin: 0 auto; }
  </style>
</head>
<body>
  <div class="container">
    <h1>QR Code para WhatsApp Bot</h1>
    <p>Escaneie o QR code abaixo com seu WhatsApp para autenticar o bot</p>
    <img src="${qrBase64}" alt="QR Code">
    <p>Gerado em: ${new Date().toLocaleString('pt-BR')}</p>
  </div>
</body>
</html>`;
    
    // Salvar o HTML para uso offline
    const htmlPath = path.join(__dirname, 'qr-code.html');
    fs.writeFileSync(htmlPath, htmlQR);
    console.log(`\nArquivo HTML com QR code salvo em: ${htmlPath}`);
    
  } catch (error) {
    console.error('Erro ao gerar imagem base64 do QR code:', error);
  }

  // Gerar imagem do QR code
  try {
    await qrcode_lib.toFile(QR_IMG_FILE, qr, {
      scale: 8,
      margin: 4,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });
    console.log(`\nQR Code salvo como imagem em: ${QR_IMG_FILE}`);
    console.log(`Acesse http://localhost:${PORT} para visualizar o QR code`);
  } catch (error) {
    console.error('Erro ao gerar imagem do QR code:', error);
  }

  // Gerar QR code no terminal
  try {
    console.log('\nQR Code em ASCII (pode não funcionar em todos os terminais):');
    qrcode.generate(qr, { small: true });
  } catch (error) {
    console.error('Erro ao gerar QR code em ASCII:', error);
  }
  
  // Salvar QR code em arquivo
  try {
    fs.writeFileSync(QR_FILE, qr);
    console.log('\nQR Code salvo em texto em:', QR_FILE);
  } catch (error) {
    console.error('Erro ao salvar QR code em arquivo:', error);
  }
  
  console.log('\n### IMPORTANTE ###');
  console.log('- Você tem 60 segundos para escanear antes de um novo QR code ser gerado');
  console.log('- Se estiver usando o Railway, verifique os logs para ver estas instruções');
  console.log('- Use uma das opções acima para acessar o QR code');
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