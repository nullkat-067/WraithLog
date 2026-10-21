import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import { EventEmitter } from 'node:events';
import makeWASocket, { Browsers, DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import pino from 'pino';

const APP = 'WraithLog';
const ORG = 'NullKat Development';
const DATA_DIR = process.env.WRAITHLOG_DATA_DIR || path.join(process.cwd(), 'data');
const AUTH_DIR = path.join(DATA_DIR, 'auth');
const MESSAGES_FILE = path.join(DATA_DIR, 'message.json');
const DELETED_FILE = path.join(DATA_DIR, 'deleted.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const DEFAULT_SETTINGS = { maxMessages: 5000, maxDeleted: 5000 };
const C = { red: '\x1b[31m', brightRed: '\x1b[91m', white: '\x1b[37m', gray: '\x1b[90m', reset: '\x1b[0m', bold: '\x1b[1m' };
const red = text => `${C.red}${text}${C.reset}`;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const LOGO = `${C.brightRed}${C.bold}
██╗    ██╗██████╗  █████╗ ██╗████████╗██╗  ██╗██╗      ██████╗  ██████╗
╚██╗  ██╔╝██╔══██╗██╔══██╗██║╚══██╔══╝██║  ██║██║     ██╔═══██╗██╔════╝
 ╚████╔╝ ██████╔╝███████║██║   ██║   ███████║██║     ██║   ██║██║  ███╗
  ╚██╔╝  ██╔══██╗██╔══██║██║   ██║   ██╔══██║██║     ██║   ██║██║   ██║
   ██║   ██║  ██║██║  ██║██║   ██║   ██║  ██║███████╗╚██████╔╝╚██████╔╝
   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝   ╚═╝   ╚═╝  ╚═╝╚══════╝ ╚═════╝  ╚═════╝
                 WRAITHLOG
${C.reset}`;

function normalizePhone(input = '') {
  const digits = String(input).replace(/[^0-9]/g, '');
  if (digits.length < 7 || digits.length > 15) throw new Error('Phone number must contain 7–15 digits, including the country code.');
  return digits;
}
function jidIdentity(jid = '') { return jid.split(':')[0].split('@')[0] || jid || 'unknown'; }
function isGroup(jid = '') { return String(jid).endsWith('@g.us'); }
function isoTimestamp(value) { const n = Number(value); return Number.isFinite(n) && n > 0 ? new Date(n < 1e12 ? n * 1000 : n).toISOString() : null; }
function unwrap(message) {
  let current = message;
  while (current?.ephemeralMessage?.message || current?.viewOnceMessage?.message || current?.viewOnceMessageV2?.message || current?.viewOnceMessageV2Extension?.message || current?.documentWithCaptionMessage?.message || current?.editedMessage?.message) current = current.ephemeralMessage?.message || current.viewOnceMessage?.message || current.viewOnceMessageV2?.message || current.viewOnceMessageV2Extension?.message || current.documentWithCaptionMessage?.message || current.editedMessage?.message;
  return current || null;
}
function textOf(message) {
  if (!message) return null;
  if (message.message) return textOf(unwrap(message.message));
  if (message.conversation) return message.conversation;
  for (const key of ['extendedTextMessage', 'imageMessage', 'videoMessage', 'documentMessage', 'audioMessage', 'buttonsResponseMessage', 'listResponseMessage', 'templateButtonReplyMessage', 'reactionMessage', 'pollUpdateMessage']) {
    const item = message[key];
    if (!item) continue;
    return item.text || item.caption || item.title || item.selectedDisplayText || item.contentText || item.name || `[${key.replace('Message', '')} tanpa teks]`;
  }
  return null;
}
function replyOf(message) {
  const context = message?.extendedTextMessage?.contextInfo || message?.imageMessage?.contextInfo || message?.videoMessage?.contextInfo || message?.documentMessage?.contextInfo;
  if (!context) return null;
  return { stanzaId: context.stanzaId || null, participant: context.participant || null, text: textOf(context.quotedMessage) || null };
}
function formatRecord(record) {
  const lines = [`[${record.deleted ? 'DELETED' : 'MESSAGE'}] ${record.sentAt || 'unknown'}`, `Sender No. : ${record.senderIdentity || 'unknown'}`, `Chat Type  : ${(record.chatType || 'unknown').toUpperCase()}`];
  if (record.chatType === 'group' || record.groupName || record.groupJid) lines.push(`Group      : ${record.groupName || 'Group name unavailable'} (${record.groupJid || 'Group JID unavailable'})`);
  lines.push(`Message ID: ${record.messageId || 'unknown'}`, `Message   : ${record.content ?? '[content unavailable]'}`);
  if (record.replyContext?.text || record.replyContext?.stanzaId) lines.push(`Reply     : ${record.replyContext.text || '[reply content unavailable]'}${record.replyContext.stanzaId ? ` [${record.replyContext.stanzaId}]` : ''}`);
  if (record.deleted) lines.push(`Detected  : ${record.deletedAt || 'unknown'}`);
  return lines.join('\n');
}

async function safeWrite(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temporary, file);
  try { await fs.chmod(file, 0o600); } catch {}
}
async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') try { await fs.rename(file, `${file}.corrupt-${Date.now()}`); } catch {}
    await safeWrite(file, fallback);
    return structuredClone(fallback);
  }
}
class Storage {
  constructor() { this.writeQueue = Promise.resolve(); this.settings = { ...DEFAULT_SETTINGS }; this.messages = []; this.deleted = []; }
  async init() {
    await fs.mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
    await fs.mkdir(AUTH_DIR, { recursive: true, mode: 0o700 });
    this.settings = { ...DEFAULT_SETTINGS, ...(await readJson(SETTINGS_FILE, DEFAULT_SETTINGS)) };
    this.messages = await readJson(MESSAGES_FILE, []);
    this.deleted = await readJson(DELETED_FILE, []);
    return this;
  }
  save(file, value) { this.writeQueue = this.writeQueue.then(() => safeWrite(file, value)); return this.writeQueue; }
  async add(record) {
    if (!record?.messageId) return;
    const index = this.messages.findIndex(item => item.messageId === record.messageId && item.chatJid === record.chatJid);
    if (index >= 0) this.messages[index] = { ...this.messages[index], ...record }; else this.messages.push(record);
    this.messages = this.messages.slice(-Number(this.settings.maxMessages));
    await this.save(MESSAGES_FILE, this.messages);
  }
  async revoke(key, metadata) {
    if (this.deleted.some(item => item.messageId === key.messageId && item.chatJid === key.chatJid)) return { duplicate: true };
    const original = this.messages.find(item => item.messageId === key.messageId && item.chatJid === key.chatJid);
    const usefulMetadata = Object.fromEntries(Object.entries(metadata || {}).filter(([, value]) => value !== null && value !== undefined && value !== ''));
    const record = { ...(original || {}), ...usefulMetadata, messageId: key.messageId, chatJid: key.chatJid, deleted: true, deletedAt: new Date().toISOString(), contentAvailable: Boolean(original?.content || usefulMetadata.content) };
    this.deleted.push(record);
    this.deleted = this.deleted.slice(-Number(this.settings.maxDeleted));
    const index = this.messages.findIndex(item => item.messageId === key.messageId && item.chatJid === key.chatJid);
    if (index >= 0) this.messages[index] = { ...this.messages[index], deleted: true, deletedAt: record.deletedAt };
    await Promise.all([this.save(DELETED_FILE, this.deleted), this.save(MESSAGES_FILE, this.messages)]);
    return { duplicate: false, record };
  }
  search(phone, deletedOnly) { return (deletedOnly ? this.deleted : this.messages.filter(item => !item.deleted)).filter(item => String(item.senderIdentity || '').replace(/[^0-9]/g, '').endsWith(phone)); }
}

class WhatsApp extends EventEmitter {
  constructor(storage) { super(); this.storage = storage; this.sock = null; this.listeners = []; this.stopRequested = false; this.reconnectTimer = null; this.status = 'DISCONNECTED'; this.phone = null; }
  async start(phone = null) {
    this.stopRequested = false; if (phone) this.phone = phone;
    const auth = await useMultiFileAuthState(AUTH_DIR);
    if (!auth.state.creds.registered && !this.phone) return;
    await this.open(auth.state, auth.saveCreds);
  }
  async open(state, saveCreds) {
    this.removeListeners();
    this.sock = makeWASocket({ auth: state, browser: Browsers.ubuntu('Chrome'), logger: pino({ level: 'silent' }), markOnlineOnConnect: false, printQRInTerminal: false, syncFullHistory: false });
    const onCreds = () => saveCreds();
    const onUpsert = data => this.process(data?.messages || []);
    const onUpdate = data => this.process((data || []).map(item => ({ key: item.key, message: item.update?.message, messageTimestamp: item.update?.messageTimestamp, participant: item.update?.participant })));
    const onConnection = update => this.connection(update, state, saveCreds);
    const onGroups = data => this.emit('groups.update', data);
    for (const [event, handler] of [['creds.update', onCreds], ['messages.upsert', onUpsert], ['messages.update', onUpdate], ['connection.update', onConnection], ['groups.update', onGroups]]) this.sock.ev.on(event, handler), this.listeners.push([event, handler]);
    if (!state.creds.registered && this.phone) {
      await wait(1200);
      try { this.emit('pairingCode', await this.sock.requestPairingCode(this.phone)); } catch (error) { this.emit('pairingError', new Error(`Pairing code request failed: ${error.message}`)); }
    }
  }
  waitForConnected(timeoutMs = 120000) {
    if (this.status === 'CONNECTED') return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { cleanup(); reject(new Error('Pairing did not complete within 120 seconds.')); }, timeoutMs);
      const connected = () => { cleanup(); resolve(); };
      const failed = error => { cleanup(); reject(error); };
      const cleanup = () => { clearTimeout(timer); this.off('connected', connected); this.off('pairingError', failed); };
      this.once('connected', connected); this.once('pairingError', failed);
    });
  }
  removeListeners() { if (!this.sock) return; for (const [event, handler] of this.listeners) this.sock.ev.off(event, handler); this.listeners = []; }
  async connection({ connection, lastDisconnect, qr }) {
    if (qr) this.emit('qrSuppressed');
    if (connection === 'open') { this.status = 'CONNECTED'; this.emit('connected'); return; }
    if (connection !== 'close') return;
    const code = lastDisconnect?.error?.output?.statusCode; this.status = 'DISCONNECTED'; this.emit('disconnected', code);
    if (this.stopRequested || code === DisconnectReason.loggedOut || code === DisconnectReason.forbidden) return;
    clearTimeout(this.reconnectTimer); this.reconnectTimer = setTimeout(async () => { try { const auth = await useMultiFileAuthState(AUTH_DIR); await this.open(auth.state, auth.saveCreds); } catch (error) { this.emit('error', error); } }, 2000);
  }
  async process(messages) {
    for (const msg of messages) try {
      const body = unwrap(msg.message); const protocol = body?.protocolMessage;
      if (protocol && (protocol.type === 0 || String(protocol.type).toUpperCase() === 'REVOKE')) { await this.processRevoke(msg, protocol); continue; }
      if (!msg.key?.id || !body || msg.key.remoteJid === 'status@broadcast') continue;
      const chatJid = msg.key.remoteJid || msg.key.remoteJidAlt; const group = isGroup(chatJid);
      const sender = group ? (msg.key.participantAlt || msg.participantAlt || msg.key.participant || msg.participant || null) : (msg.key.fromMe ? (msg.key.remoteJidAlt || chatJid) : (msg.key.participantAlt || msg.participantAlt || msg.key.participant || chatJid));
      let groupName = null; if (group) try { groupName = (await this.sock.groupMetadata(chatJid)).subject || null; } catch {}
      const content = textOf(body);
      const record = { messageId: msg.key.id, chatJid, senderJid: sender, senderIdentity: jidIdentity(sender), chatType: group ? 'group' : 'private', groupJid: group ? chatJid : null, groupName, content, contentAvailable: Boolean(content), sentAt: isoTimestamp(msg.messageTimestamp), replyContext: replyOf(body), deleted: false, storedAt: new Date().toISOString() };
      await this.storage.add(record);
      this.emit('message', record);
    } catch (error) { this.emit('error', error); }
  }
  async processRevoke(msg, protocol) {
    const key = protocol.key || msg.key; if (!key?.id || !key?.remoteJid) return;
    const chatJid = key.remoteJid || key.remoteJidAlt; const group = isGroup(chatJid); const sender = key.participantAlt || msg.participantAlt || key.participant || (group ? msg.participant : chatJid); let groupName = null;
    if (group) try { groupName = (await this.sock.groupMetadata(chatJid)).subject || null; } catch {}
    const metadata = { chatType: group ? 'group' : 'private', groupJid: group ? chatJid : null, groupName, deletionType: 'REVOKE' };
    if (sender) { metadata.senderJid = sender; metadata.senderIdentity = jidIdentity(sender); }
    const result = await this.storage.revoke({ messageId: key.id, chatJid }, metadata);
    if (!result.duplicate) this.emit('deletion', result.record);
  }
  async stop() { this.stopRequested = true; clearTimeout(this.reconnectTimer); this.removeListeners(); try { this.sock?.ws?.close(); } catch {} this.sock = null; }
}

class WraithLog {
  constructor() { this.rl = null; this.storage = null; this.whatsapp = null; this.stopping = false; this.activeMode = 0; }
  async init() {
    console.log(LOGO, `${C.gray}${ORG} // secure local monitor${C.reset}\n`);
    const steps = [[1, 'Checking Node.js runtime'], [2, 'Checking local storage'], [5, 'Loading configuration'], [9, 'Restoring message processor'], [17, 'Checking archive limits'], [31, 'Preparing connection manager'], [48, 'Securing separate session directory'], [67, 'Installing event pipeline'], [83, 'Preparing terminal interface'], [96, 'Finalizing'], [100, 'Initialization complete']];
    for (const [percent, message] of steps) { if (percent === 2) this.storage = await new Storage().init(); if (percent === 31) this.whatsapp = new WhatsApp(this.storage); console.log(`${C.red}[${String(percent).padStart(3)}%]${C.reset} ${message}`); await wait(35); }
    console.log(`${C.gray}Data: ${DATA_DIR}${C.reset}\n`); this.events();
    this.rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true }); this.rl.on('SIGINT', () => this.stop()); process.on('SIGINT', () => this.stop()); process.on('SIGTERM', () => this.stop());
    await this.whatsapp.start();
  }
  events() {
    this.whatsapp.on('pairingCode', code => console.log(`\n${red('[PAIRING CODE]')} ${C.bold}${C.white}${code}${C.reset}\n${C.gray}WhatsApp > Linked devices > Link a device > Link with phone number.${C.reset}\n`));
    this.whatsapp.on('connected', () => console.log(`\n${C.white}[CONNECTED] WhatsApp linked device is active.${C.reset}\n`));
    this.whatsapp.on('disconnected', code => console.log(`\n${C.gray}[DISCONNECTED] Connection lost${code ? ` (${code})` : ''}; retrying connection.${C.reset}\n`));
    this.whatsapp.on('qrSuppressed', () => console.log(`${C.gray}[auth] QR event ignored; WraithLog uses pairing codes only.${C.reset}`));
    this.whatsapp.on('error', error => console.log(`${red('[ERROR]')} ${error.message}`));
    this.whatsapp.on('message', () => { if (this.activeMode === 1) this.renderDashboard(false); });
    this.whatsapp.on('deletion', () => { if (this.activeMode === 2) this.renderDashboard(true); });
  }
  ask(prompt) { return new Promise(resolve => { if (this.rl?.closed) return resolve('exit'); this.rl.question(prompt, answer => resolve(answer.trim())); }); }
  print(records, empty = 'No stored data.') { if (!records.length) return console.log(`${C.gray}${empty}${C.reset}`); console.log(`${C.gray}Showing all ${records.length} stored records. Newest messages appear at the bottom.${C.reset}`); for (const record of records) console.log(record.deleted ? red(formatRecord(record)) : formatRecord(record)); }
  renderDashboard(deletedOnly) { if (this.stopping) return; process.stdout.write('\x1b[2J\x1b[H'); console.log(LOGO); console.log(`${C.red}${C.bold}${deletedOnly ? 'DELETED MESSAGES // LIVE' : 'LATEST MESSAGES // LIVE'}${C.reset}`); console.log(`${C.gray}Dashboard updates automatically. New messages are appended at the bottom. Type search, help, or out.${C.reset}\n`); this.print(deletedOnly ? this.storage.deleted : this.storage.messages); }
  async list(deletedOnly) {
    this.activeMode = deletedOnly ? 2 : 1; this.renderDashboard(deletedOnly);
    while (!this.stopping && this.activeMode === (deletedOnly ? 2 : 1)) { const command = (await this.ask(`${C.red}command > ${C.reset}`)).toLowerCase(); if (command === 'back' || command === 'out') { this.activeMode = 0; return; } if (command === 'exit') return this.stop(); if (command === 'refresh') { this.renderDashboard(deletedOnly); continue; } if (command === 'help') { console.log('search = filter by phone number | refresh = redraw | out = return to main menu | exit = quit'); continue; } if (command === 'search') { try { const phone = normalizePhone(await this.ask('phone number > ')); const results = deletedOnly ? this.storage.search(phone, true) : this.storage.messages.filter(item => String(item.senderIdentity || '').replace(/[^0-9]/g, '').endsWith(phone)); this.print(results, 'No results.'); } catch (error) { console.log(red(error.message)); } } else console.log(`${C.gray}Unknown command. Type help or out.${C.reset}`); }
  }
  async link() { if (this.whatsapp.status === 'CONNECTED') return console.log('Already connected.'); try { const phone = normalizePhone(await this.ask('Your WhatsApp number with country code > ')); console.log(`${C.gray}Waiting for the pairing code and connection confirmation. The menu will remain locked until pairing is complete.${C.reset}`); await this.whatsapp.start(phone); await this.whatsapp.waitForConnected(); } catch (error) { console.log(red(error.message)); } }
  credits() { console.log(`\nOrganization: ${ORG}\nDeveloper: undefined\nCo-developer: undefined\n\n${red('WARNING!')}\n${red('Use only with accounts and conversations you own or are authorized to monitor. Protect private messages, authentication sessions, and stored data. Message-deletion detection depends on supported events and previously stored messages.')}\n`); }
  async run() { await this.init(); while (!this.stopping) { console.log(`${C.red}${C.bold}WraithLog Main Menu${C.reset}\n[1] Latest Messages\n[2] Deleted Messages\n[3] Link WhatsApp\n[4] Credits\n[5] Exit`); const choice = await this.ask(`${C.red}select > ${C.reset}`); if (choice === '1') await this.list(false); else if (choice === '2') await this.list(true); else if (choice === '3') await this.link(); else if (choice === '4') this.credits(); else if (choice === '5' || choice === 'exit') await this.stop(); else console.log(red('Invalid input. Choose 1–5.')); } }
  async stop() { if (this.stopping) return; this.stopping = true; console.log(`\n${C.gray}Stopping monitoring and flushing storage...${C.reset}`); await this.whatsapp?.stop(); await this.storage?.writeQueue; this.rl?.close(); console.log(`${C.white}WraithLog stopped safely.${C.reset}`); }
}

new WraithLog().run().catch(error => { console.error(red(error.stack || error.message)); process.exitCode = 1; });
