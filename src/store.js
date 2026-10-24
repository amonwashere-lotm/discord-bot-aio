import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class Store {
  constructor(path = './data/bot.sqlite') {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS users (
      guild TEXT, id TEXT, xp INTEGER NOT NULL DEFAULT 0, balance INTEGER NOT NULL DEFAULT 0,
      last_xp INTEGER NOT NULL DEFAULT 0, last_daily INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild,id));
      CREATE TABLE IF NOT EXISTS settings (guild TEXT PRIMARY KEY, value TEXT NOT NULL);`);
  }
  user(guild, id) {
    this.db.prepare('INSERT OR IGNORE INTO users(guild,id) VALUES (?,?)').run(guild,id);
    return this.db.prepare('SELECT * FROM users WHERE guild=? AND id=?').get(guild,id);
  }
  settings(guild) {
    const row = this.db.prepare('SELECT value FROM settings WHERE guild=?').get(guild);
    return { automod: false, antinuke: false, logChannel: null, leveling: true, economy: true, honeypot: false, honeypotChannel: null, honeypotAction: 'timeout', verification: false, verificationChannel: null, verifiedRole: null, verificationMessage: null, memberArea: true, memberChannel: null, memberRole: null, emojis: {}, ...JSON.parse(row?.value ?? '{}') };
  }
  configure(guild, patch) {
    const value = { ...this.settings(guild), ...patch };
    this.db.prepare('INSERT INTO settings VALUES (?,?) ON CONFLICT(guild) DO UPDATE SET value=excluded.value').run(guild,JSON.stringify(value));
    return value;
  }
  xp(guild,id,now=Date.now()) {
    this.user(guild,id);
    return this.db.prepare('UPDATE users SET xp=xp+20,last_xp=? WHERE guild=? AND id=? AND xp<=9007199254740971 AND last_xp<=?').run(now,guild,id,now-60000).changes > 0;
  }
  daily(guild,id,now=Date.now()) {
    if(this.user(guild,id).balance>Number.MAX_SAFE_INTEGER-500) throw new Error('Balance limit reached.');
    return this.db.prepare('UPDATE users SET balance=balance+500,last_daily=? WHERE guild=? AND id=? AND last_daily<=?').run(now,guild,id,now-86400000).changes > 0;
  }
  transfer(guild,from,to,amount) {
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
