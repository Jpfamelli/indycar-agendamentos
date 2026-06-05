// Banco de dados SQLite (nativo do Node 22+, sem dependências externas)
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// DB_PATH permite apontar o banco para um disco persistente em produção (deploy)
const DB_PATH = process.env.DB_PATH || join(__dirname, 'indycar.sqlite');
export const db = new DatabaseSync(DB_PATH);

// journal_mode = DELETE (padrão): cada commit é gravado imediatamente no arquivo
// principal, garantindo durabilidade mesmo se o processo for encerrado de forma abrupta.
db.exec('PRAGMA journal_mode = DELETE;');
db.exec('PRAGMA synchronous = FULL;');
db.exec('PRAGMA foreign_keys = ON;');

// ----------------------------------------------------------------------------
// SCHEMA
// ----------------------------------------------------------------------------
db.exec(`
CREATE TABLE IF NOT EXISTS empresa (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  nome TEXT NOT NULL,
  endereco TEXT,
  slogan TEXT,
  telefone TEXT
);

CREATE TABLE IF NOT EXISTS consultores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  telefone TEXT,
  cor TEXT DEFAULT '#e6192e',
  ativo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  telefone TEXT,
  veiculo TEXT,
  placa TEXT,
  modelo TEXT,
  origem TEXT DEFAULT 'Google',
  observacoes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS agendamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER,
  cliente_nome TEXT NOT NULL,
  telefone TEXT,
  veiculo TEXT,
  placa TEXT,
  servico TEXT NOT NULL,
  data TEXT NOT NULL,            -- YYYY-MM-DD
  hora TEXT NOT NULL,            -- HH:MM
  consultor_id INTEGER,
  origem TEXT DEFAULT 'Google',
  -- aguardando | confirmado | em_atendimento | compareceu | nao_veio | concluido | nao_fechou
  status TEXT NOT NULL DEFAULT 'aguardando',
  confirmado INTEGER NOT NULL DEFAULT 0,
  compareceu INTEGER,           -- NULL=indef, 1=veio, 0=nao veio
  valor REAL DEFAULT 0,
  observacoes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (consultor_id) REFERENCES consultores(id) ON DELETE SET NULL,
  FOREIGN KEY (cliente_id)   REFERENCES clientes(id)    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  gatilho TEXT,                 -- confirmacao | lembrete | followup | pos_servico | manual
  corpo TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS whatsapp_mensagens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agendamento_id INTEGER,
  cliente_id INTEGER,
  telefone TEXT NOT NULL,
  nome TEXT,
  corpo TEXT NOT NULL,
  direcao TEXT NOT NULL DEFAULT 'saida',   -- saida | entrada
  status TEXT NOT NULL DEFAULT 'pendente', -- pendente | enviado | entregue | lido | recebido | falhou
  wamid TEXT,                              -- id da mensagem retornado pela Cloud API
  erro TEXT,                               -- detalhe de erro, se houver
  template_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (agendamento_id) REFERENCES agendamentos(id) ON DELETE SET NULL
);

-- Configuração da integração com a WhatsApp Cloud API (Meta). Linha única.
CREATE TABLE IF NOT EXISTS whatsapp_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  ativo INTEGER NOT NULL DEFAULT 0,         -- 1 = enviar pela Cloud API; 0 = usar link wa.me
  phone_number_id TEXT,                     -- ID do número (Cloud API)
  access_token TEXT,                        -- token de acesso permanente
  business_account_id TEXT,                 -- WABA ID
  verify_token TEXT DEFAULT 'indycar',      -- token de verificação do webhook
  api_version TEXT DEFAULT 'v21.0',
  numero_exibicao TEXT,                     -- número que aparece (ex.: +55 12 99999-0000)
  lembrete_ativo INTEGER NOT NULL DEFAULT 0,-- enviar lembretes automáticos?
  lembrete_horas INTEGER NOT NULL DEFAULT 24,-- quantas horas antes
  atualizado_em TEXT
);

-- Catálogo de serviços (Arsenal)
CREATE TABLE IF NOT EXISTS servicos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  descricao TEXT,
  preco REAL DEFAULT 0,
  duracao_min INTEGER DEFAULT 60,           -- duração estimada em minutos
  categoria TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Configuração da IA de atendimento (Anthropic). Linha única.
CREATE TABLE IF NOT EXISTS ia_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  ativo INTEGER NOT NULL DEFAULT 0,         -- responder automaticamente?
  motor TEXT DEFAULT 'anthropic',           -- 'anthropic' | 'codewords'
  api_key TEXT,                             -- chave da API Anthropic
  modelo TEXT DEFAULT 'claude-opus-4-8',
  persona TEXT,                             -- instruções/personalidade extra
  saudacao TEXT,                            -- mensagem opcional de abertura
  cw_api_key TEXT,                          -- chave do CodeWords (cwk-...)
  cw_service_id TEXT,                       -- workflow usado como cérebro (atendente)
  cw_db_service_id TEXT,                    -- workflow do banco de agendamentos
  cw_noshow_service_id TEXT,               -- workflow de notificação de ausência
  cw_connect_service_id TEXT,              -- workflow de conexão do WhatsApp (QR Code)
  cw_device_id TEXT,                       -- id do dispositivo no whatsapp_device_manager
  cw_base_url TEXT DEFAULT 'https://runtime.codewords.ai',
  atualizado_em TEXT
);
`);

// ----------------------------------------------------------------------------
// MIGRAÇÕES (adiciona colunas novas em bancos já existentes — idempotente)
// ----------------------------------------------------------------------------
function garanteColuna(tabela, coluna, definicao) {
  const colunas = db.prepare(`PRAGMA table_info(${tabela})`).all().map((c) => c.name);
  if (!colunas.includes(coluna)) db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${definicao}`);
}
garanteColuna('whatsapp_mensagens', 'wamid', 'TEXT');
garanteColuna('whatsapp_mensagens', 'erro', 'TEXT');
garanteColuna('agendamentos', 'lembrete_enviado', 'INTEGER NOT NULL DEFAULT 0');
garanteColuna('whatsapp_config', 'lembrete_ativo', 'INTEGER NOT NULL DEFAULT 0');
garanteColuna('whatsapp_config', 'lembrete_horas', 'INTEGER NOT NULL DEFAULT 24');
garanteColuna('ia_config', 'motor', "TEXT DEFAULT 'anthropic'");
garanteColuna('ia_config', 'cw_api_key', 'TEXT');
garanteColuna('ia_config', 'cw_service_id', 'TEXT');
garanteColuna('ia_config', 'cw_db_service_id', 'TEXT');
garanteColuna('ia_config', 'cw_noshow_service_id', 'TEXT');
garanteColuna('ia_config', 'cw_connect_service_id', 'TEXT');
garanteColuna('ia_config', 'cw_device_id', 'TEXT');
garanteColuna('ia_config', 'cw_base_url', "TEXT DEFAULT 'https://runtime.codewords.ai'");

// ----------------------------------------------------------------------------
// SEED (só na primeira execução)
// ----------------------------------------------------------------------------
const empresaCount = db.prepare('SELECT COUNT(*) AS n FROM empresa').get().n;
if (empresaCount === 0) {
  db.prepare(`INSERT INTO empresa (id, nome, endereco, slogan, telefone)
              VALUES (1, ?, ?, ?, ?)`).run(
    'IndyCar Centro Automotivo',
    'Av. Bandeirantes, 875 — Taubaté/SP',
    'Quem conhece, indica!',
    '12 99999-0000'
  );
}

if (db.prepare('SELECT COUNT(*) AS n FROM consultores').get().n === 0) {
  const ins = db.prepare('INSERT INTO consultores (nome, telefone, cor) VALUES (?,?,?)');
  ins.run('Rafael Mendes', '12988880001', '#e6192e');
  ins.run('Bruno Almeida', '12988880002', '#3b82f6');
  ins.run('Carla Souza',   '12988880003', '#a855f7');
}

if (db.prepare('SELECT COUNT(*) AS n FROM whatsapp_templates').get().n === 0) {
  const ins = db.prepare('INSERT INTO whatsapp_templates (nome, gatilho, corpo) VALUES (?,?,?)');
  ins.run('Confirmação de agendamento', 'confirmacao',
    'Olá {nome}! 👋 Aqui é da *IndyCar Centro Automotivo*. Confirmando seu horário para *{servico}* no dia *{data}* às *{hora}*. Podemos confirmar? 🏁');
  ins.run('Lembrete (1 dia antes)', 'lembrete',
    'Oi {nome}! Passando para lembrar do seu agendamento amanhã ({data}) às {hora} para {servico}. Te esperamos! 🚗');
  ins.run('Follow-up (não veio)', 'followup',
    'Olá {nome}, sentimos sua falta hoje! 😟 Quer remarcar seu {servico}? É só responder por aqui que reagendamos pra você.');
  ins.run('Pós-serviço', 'pos_servico',
    'Olá {nome}! Seu {veiculo} está pronto e ficou show! 🏁 Obrigado pela confiança. Lembrando: quem conhece, indica! 😉');
}

if (db.prepare('SELECT COUNT(*) AS n FROM whatsapp_config').get().n === 0) {
  db.prepare(`INSERT INTO whatsapp_config (id, ativo, verify_token, api_version)
              VALUES (1, 0, 'indycar', 'v21.0')`).run();
}

if (db.prepare('SELECT COUNT(*) AS n FROM ia_config').get().n === 0) {
  db.prepare(`INSERT INTO ia_config (id, ativo, modelo) VALUES (1, 0, 'claude-opus-4-8')`).run();
}

// Em deploy/nuvem: permite configurar a integração por variáveis de ambiente.
// Só preenche campos ainda vazios (não sobrescreve o que foi salvo pela interface).
{
  const envMap = {
    api_key: 'ANTHROPIC_API_KEY',
    cw_api_key: 'CW_API_KEY',
    cw_service_id: 'CW_SERVICE_ID',
    cw_db_service_id: 'CW_DB_SERVICE_ID',
    cw_noshow_service_id: 'CW_NOSHOW_SERVICE_ID',
    cw_connect_service_id: 'CW_CONNECT_SERVICE_ID',
    cw_device_id: 'CW_DEVICE_ID',
  };
  const row = db.prepare('SELECT * FROM ia_config WHERE id=1').get() || {};
  for (const [col, env] of Object.entries(envMap)) {
    if (process.env[env] && !row[col]) db.prepare(`UPDATE ia_config SET ${col}=? WHERE id=1`).run(process.env[env]);
  }
}

if (db.prepare('SELECT COUNT(*) AS n FROM servicos').get().n === 0) {
  const ins = db.prepare('INSERT INTO servicos (nome, descricao, preco, duracao_min, categoria) VALUES (?,?,?,?,?)');
  ins.run('Troca de óleo', 'Troca de óleo do motor + filtro', 180, 40, 'Manutenção');
  ins.run('Troca de óleo câmbio automático', 'Troca de óleo do câmbio automático', 450, 90, 'Câmbio');
  ins.run('Alinhamento e balanceamento', 'Alinhamento 3D + balanceamento das 4 rodas', 150, 60, 'Suspensão');
  ins.run('Revisão completa', 'Checklist completo de 30 itens', 250, 120, 'Revisão');
  ins.run('Freios', 'Troca de pastilhas e verificação de discos', 320, 90, 'Freios');
  ins.run('Suspensão', 'Diagnóstico e troca de amortecedores', 600, 120, 'Suspensão');
  ins.run('Ar-condicionado', 'Higienização e recarga de gás', 280, 60, 'Conforto');
  ins.run('Diagnóstico eletrônico', 'Leitura de scanner e diagnóstico', 120, 30, 'Diagnóstico');
}

if (db.prepare('SELECT COUNT(*) AS n FROM clientes').get().n === 0) {
  db.prepare(`INSERT INTO clientes (nome, telefone, veiculo, placa, modelo, origem)
              VALUES (?,?,?,?,?,?)`)
    .run('João', '12982271090', 'Ônix', 'AURA6742', 'Chevrolet Ônix', 'Google');
}

if (db.prepare('SELECT COUNT(*) AS n FROM agendamentos').get().n === 0) {
  const hoje = new Date().toISOString().slice(0, 10);
  const cli = db.prepare('SELECT id FROM clientes WHERE telefone = ?').get('12982271090');
  db.prepare(`INSERT INTO agendamentos
      (cliente_id, cliente_nome, telefone, veiculo, placa, servico, data, hora, consultor_id, origem, status, confirmado, compareceu)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(cli?.id ?? null, 'João', '12982271090', 'Ônix', 'AURA6742',
         'Troca de óleo câmbio automático', hoje, '09:00', 1, 'Google',
         'confirmado', 1, 0);
}

// Garante que o seed seja gravado no arquivo principal (durável mesmo com kill abrupto)
db.exec('PRAGMA wal_checkpoint(TRUNCATE);');

// Encerramento gracioso: faz checkpoint e fecha o banco ao receber sinal de parada
function fecharBanco() {
  try { db.exec('PRAGMA wal_checkpoint(TRUNCATE);'); db.close(); } catch { /* já fechado */ }
}
process.on('SIGINT',  () => { fecharBanco(); process.exit(0); });
process.on('SIGTERM', () => { fecharBanco(); process.exit(0); });
process.on('exit', fecharBanco);

export default db;
