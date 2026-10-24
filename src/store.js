import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { defaults } from './settings.js';
import { dirname } from 'node:path';

export class Store {
  constructor(path = './data/bot.sqlite') {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS users (
      guild TEXT, id TEXT, xp INTEGER NOT NULL DEFAULT 0, balance INTEGER NOT NULL DEFAULT 0,
      last_xp INTEGER NOT NULL DEFAULT 0, last_daily INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild,id));
      CREATE TABLE IF NOT EXISTS settings (guild TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS warnings (id INTEGER PRIMARY KEY AUTOINCREMENT, guild TEXT, member TEXT, moderator TEXT, reason TEXT, created INTEGER);
      CREATE INDEX IF NOT EXISTS warnings_member ON warnings(guild,member);
      CREATE TABLE IF NOT EXISTS incidents (id INTEGER PRIMARY KEY AUTOINCREMENT, guild TEXT, message TEXT, created INTEGER);
      CREATE INDEX IF NOT EXISTS incidents_guild ON incidents(guild,id);`);
    const columns=new Set(this.db.prepare('PRAGMA table_info(users)').all().map(c=>c.name));
    for(const column of ['bank','last_work']) if(!columns.has(column)) this.db.exec(`ALTER TABLE users ADD COLUMN ${column} INTEGER NOT NULL DEFAULT 0`);
    this.db.exec('CREATE INDEX IF NOT EXISTS users_rank ON users(guild,xp DESC,id)');
  }
  user(guild, id) {
    this.db.prepare('INSERT OR IGNORE INTO users(guild,id) VALUES (?,?)').run(guild,id);
    return this.db.prepare('SELECT * FROM users WHERE guild=? AND id=?').get(guild,id);
  }
  settings(guild) {
    const row = this.db.prepare('SELECT value FROM settings WHERE guild=?').get(guild);
    return { ...defaults(), automod: false, antinuke: false, logChannel: null, leveling: true, economy: true, honeypot: false, honeypotChannel: null, honeypotAction: 'timeout', verification: false, verificationChannel: null, verifiedRole: null, verificationMessage: null, memberArea: true, memberChannel: null, memberRole: null, emojis: {}, ...JSON.parse(row?.value ?? '{}') };
  }
  configure(guild, patch) {
    const value = { ...this.settings(guild), ...patch };
    this.db.prepare('INSERT INTO settings VALUES (?,?) ON CONFLICT(guild) DO UPDATE SET value=excluded.value').run(guild,JSON.stringify(value));
    return value;
  }
  xp(guild,id,now=Date.now()) {
    this.user(guild,id); const s=this.settings(guild);
    if(!s.leveling) return false;
    return this.db.prepare('UPDATE users SET xp=xp+?,last_xp=? WHERE guild=? AND id=? AND xp<=? AND last_xp<=?').run(s.xpAmount,now,guild,id,Number.MAX_SAFE_INTEGER-s.xpAmount,now-s.xpCooldownSeconds*1000).changes>0;
  }
  daily(guild,id,now=Date.now()) {
    const s=this.settings(guild); if(!s.economy) return false;
    if(this.user(guild,id).balance>Number.MAX_SAFE_INTEGER-s.dailyAmount) throw new Error('Balance limit reached.');
    return this.db.prepare('UPDATE users SET balance=balance+?,last_daily=? WHERE guild=? AND id=? AND last_daily<=?').run(s.dailyAmount,now,guild,id,now-s.dailyCooldownMinutes*60000).changes>0;
  }
  work(guild,id,now=Date.now()) {
    const s=this.settings(guild); if(!s.economy) return false;
    this.user(guild,id);
    return this.db.prepare('UPDATE users SET balance=balance+?,last_work=? WHERE guild=? AND id=? AND balance<=? AND last_work<=?').run(s.workAmount,now,guild,id,Number.MAX_SAFE_INTEGER-s.workAmount,now-s.workCooldownMinutes*60000).changes>0;
  }
  bankMove(guild,id,direction,amount) {
    if(!['deposit','withdraw'].includes(direction)) throw new Error('Invalid bank action.');
    if(!this.settings(guild).economy) return false;
    this.user(guild,id);
    if(!Number.isSafeInteger(amount)||amount<=0||amount>1e9) return false;
    const [from,to]=direction==='deposit'?['balance','bank']:['bank','balance'];
    return this.db.prepare(`UPDATE users SET ${from}=${from}-?,${to}=${to}+? WHERE guild=? AND id=? AND ${from}>=? AND ${to}<=?`).run(amount,amount,guild,id,amount,Number.MAX_SAFE_INTEGER-amount).changes>0;
  }
  rich(guild) { return this.db.prepare('SELECT id,balance,bank FROM users WHERE guild=? ORDER BY (balance+bank) DESC,id LIMIT 10').all(guild); }
  warn(guild,member,moderator,reason,now=Date.now()) {
    if(!reason.trim()||reason.length>500) throw new Error('Warning reason must be 1–500 characters.');
    const result=this.db.prepare('INSERT INTO warnings(guild,member,moderator,reason,created) VALUES (?,?,?,?,?)').run(guild,member,moderator,reason,now);
    return result.lastInsertRowid;
  }
  warnings(guild,member) { return this.db.prepare('SELECT * FROM warnings WHERE guild=? AND member=? ORDER BY id DESC LIMIT 10').all(guild,member); }
  clearWarnings(guild,member) { return this.db.prepare('DELETE FROM warnings WHERE guild=? AND member=?').run(guild,member).changes; }
  incident(guild,message) {
    this.db.prepare('INSERT INTO incidents(guild,message,created) VALUES (?,?,?)').run(guild,message.slice(0,1900),Date.now());
    this.db.prepare('DELETE FROM incidents WHERE guild=? AND id NOT IN (SELECT id FROM incidents WHERE guild=? ORDER BY id DESC LIMIT 1000)').run(guild,guild);
  }
  transfer(guild,from,to,amount) {
    if(!this.settings(guild).economy) return false;
    if (from === to || !Number.isSafeInteger(amount) || amount <= 0 || amount > 1e9) return false;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.user(guild,from); this.user(guild,to);
      const target = this.user(guild,to);
      if (!Number.isSafeInteger(target.balance + amount)) throw new Error('Balance limit reached');
      const result = this.db.prepare('UPDATE users SET balance=balance-? WHERE guild=? AND id=? AND balance>=?').run(amount,guild,from,amount);
      if (!result.changes) { this.db.exec('ROLLBACK'); return false; }
      this.db.prepare('UPDATE users SET balance=balance+? WHERE guild=? AND id=?').run(amount,guild,to);
      this.db.exec('COMMIT'); return true;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  adjust(guild, id, field, operation, amount=0) {
    if (!['xp','balance'].includes(field) || !['add','remove','set','reset'].includes(operation)) throw new Error('Invalid adjustment.');
    if (!Number.isSafeInteger(amount) || amount<0 || amount>1e9) throw new Error('Amount must be an integer from 0 to 1,000,000,000.');
    this.user(guild,id);
    // Each adjustment is one SQL statement, so concurrent commands cannot overwrite a stale balance.
    const expression={add:`${field}+?`, remove:`max(0,${field}-?)`, set:'?', reset:'0'}[operation];
    const params=operation==='reset'?[guild,id]:[amount,guild,id];
    const guard=operation==='add'?` AND ${field}<=${Number.MAX_SAFE_INTEGER-amount}`:'';
    const result=this.db.prepare(`UPDATE users SET ${field}=${expression} WHERE guild=? AND id=?${guard}`).run(...params);
    if (!result.changes) throw new Error('Value is too large to adjust safely.');
    return this.user(guild,id)[field];
  }
  resetDaily(guild,id) {
    this.user(guild,id);
    this.db.prepare('UPDATE users SET last_daily=0 WHERE guild=? AND id=?').run(guild,id);
  }
  top(guild) { return this.db.prepare('SELECT * FROM users WHERE guild=? ORDER BY xp DESC,id ASC LIMIT 10').all(guild); }
  rank(guild,id) {
    const user = this.user(guild,id);
    return this.db.prepare('SELECT count(*)+1 AS rank FROM users WHERE guild=? AND (xp>? OR (xp=? AND id<?))').get(guild,user.xp,user.xp,id).rank;
  }
}
export const level = xp => Math.floor(Math.sqrt(xp / 100));
