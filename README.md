# AIO · Discord bot

JavaScript / Node 24 bot with Discord Components v2, `?` prefix, slash commands, and mention commands. The help menu follows the supplied dark, category-based reference with Home, Search, Close, and Invite controls. Categories and command descriptions come from one command registry.

## Run

1. Install Node.js 24 or later, then run `npm ci`.
2. Copy `.env.example` to `.env`. Set a bot token and application/client ID from the Discord Developer Portal. Never commit the token.
3. Enable **Message Content Intent** and **Server Members Intent** in the portal. The bot also requests Guild Moderation events for audit log protection.
4. Invite the application with `bot` and `applications.commands` scopes. Grant View Channels, Send Messages, Attach Files, Read Message History, Manage Messages, Moderate Members, Kick Members, Ban Members, and View Audit Log. Place its role above members it should moderate. Administrator is not required.
5. Set `GUILD_ID` for immediate slash registration in a test server. Run `npm run deploy`, then `npm start`. Without `GUILD_ID`, deploy registers global commands, which may take time to propagate. Registration replaces this application's command list in the selected scope.
6. Run `?help` or `/help`. Set `/logchannel` in a private moderator channel, then enable `/automod on` and `/antinuke on` as a server administrator.

## Features

- **General:** help with automatic category discovery and search modal; ping.
- **Moderation:** purge, timeout, kick, ban. Both command paths enforce caller permissions, bot permissions, and role hierarchy. Timeout duration is 1–40,320 minutes. Purge skips messages older than 14 days.
- **Automod:** deletes Discord invites and mass mentions (5+ distinct users or everyone/here); 6 messages in 8 seconds triggers a 60-second timeout when possible. Manage Messages members are exempt. Filtered messages do not earn XP.
- **Anti-nuke:** 3 combined channel deletions, role deletions, bans, kicks, or webhook creations by one executor in 15 seconds triggers a ban. Uses new audit entries, deduplicates IDs, ignores old entries, and exempts the owner and this bot. Includes other bots and administrators. Enable only after assessing legitimate bulk moderation workflows. Requires View Audit Log and Ban Members; cannot act above its role, restore deleted resources, or guarantee prevention before damage occurs. Failure alerts go to the configured channel or process logs.
- **Leveling:** 20 XP per eligible non-command message, at most once per minute per member per server. Level = floor(sqrt(XP / 100)). Black PNG rank and top-10 leaderboard cards generated locally.
- **Economy:** balance, 500-coin daily with a rolling 24-hour cooldown, and transactional member-to-member pay. Balances and XP are isolated per server.

`?rank @member`, `?pay @member 100`, `?timeout @member 10 reason`, and their slash equivalents use the same handlers. Prefix reasons accept spaces. Menu interactions are restricted to the member who opened the menu. Responses suppress mentions.

## Command aliases

Every alias works with `?`, bot mentions, and `/`. For example, `?bal`, `@Bot bal`, and `/bal` all run `balance` with the same arguments, permissions, and cooldowns. Prefix and mention names are case insensitive. Help displays aliases and accepts them in search.

| Command | Aliases |
| --- | --- |
| help | h, commands |
| ping | latency |
| rank | level, lvl |
| leaderboard | lb, top |
| balance | bal, wallet |
| daily | claim |
| pay | give, transfer |
| settings | config |
| automod | am |
| antinuke | an |
| logchannel | setlogs |
| purge | clear |
| timeout | mute |
| kick | boot |
| ban | exile |

Restart the bot to load aliases and run `npm run deploy` to register slash aliases in the configured scope.

## Data and operations

SQLite is stored at `DATABASE_PATH` (default `./data/bot.sqlite`), with WAL enabled. Mount `data/` on persistent storage. Run one process per database. Use SQLite's backup API or stop the bot before copying the database and WAL files. Protection counters and command cooldowns are in memory and reset on restart. No external image services or paid APIs are used.

Run `npm test` and `npm run check`. Tests use in-memory databases and synthetic Discord data; a real test guild is required to verify Gateway delivery, Discord permissions, live component rendering, and moderation effects. This project contains no web dashboard or music player.

Add commands in `src/commands.js`, including a unique `aliases` array, category, description, options, permissions, and handler. They appear in help immediately after restart; rerun `npm run deploy` to update slash commands.
