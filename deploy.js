const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configurações
const DEPLOY_ENV = 'production';
const REQUIRED_FILES = [
  'index.js',
  'package.json',
  'package-lock.json',
  '.env',
  'credentials.json',
  'Dockerfile',
  'railway.toml'
];

// Função para executar comandos
function runCommand(command) {
  return new Promise((resolve, reject) => {
    console.log(`\nExecutando: ${command}`);
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Erro: ${error.message}`);
        return reject(error);
      }
      if (stderr) {
        console.error(`Stderr: ${stderr}`);
      }
      console.log(`Stdout: ${stdout}`);
      resolve(stdout);
    });
  });
}

// Função principal de deploy
async function deploy() {
  try {
    console.log('\n=== Iniciando Deploy ===');

    // Verifica se todos os arquivos necessários existem
    console.log('\nVerificando arquivos necessários...');
    REQUIRED_FILES.forEach(file => {
      if (!fs.existsSync(path.join(__dirname, file))) {
        throw new Error(`Arquivo ${file} não encontrado!`);
      }
    });

    // Verifica se o Git está instalado
    await runCommand('git --version');

    // Verifica se o Railway CLI está instalado
    try {
      await runCommand('railway version');
    } catch (error) {
      console.log('Railway CLI não encontrado, instalando...');
      await runCommand('npm i -g @railway/cli');
    }

    // Inicializa Git se necessário
    if (!fs.existsSync(path.join(__dirname, '.git'))) {
      console.log('\nInicializando repositório Git...');
      await runCommand('git init');
      await runCommand('git add .');
      await runCommand('git commit -m "Initial commit"');
    }

    // Faz login no Railway (se necessário)
    console.log('\nVerificando login no Railway...');
    await runCommand('railway login');

    // Inicia o deploy
    console.log('\nIniciando deploy no Railway...');
    await runCommand('railway up');

    console.log('\n=== Deploy concluído com sucesso! ===');
    console.log('Aguarde alguns minutos para o serviço iniciar completamente.');
    console.log('Você poderá ver os logs e o QR Code no dashboard do Railway.');

  } catch (error) {
    console.error('\nErro durante o deploy:', error);
    process.exit(1);
  }
}

// Executa o deploy
deploy(); 