# AIO · Discord bot

JavaScript / Node 24 bot with Discord Components v2, `?` prefix, slash commands, and mention commands. The help menu follows the supplied dark, category-based reference with Home, Search, Close, and Invite controls. Categories and command descriptions come from one command registry.

## Run

1. Install Node.js 24 or later, then run `npm ci`.
2. Copy `.env.example` to `.env`. Set a bot token and application/client ID from the Discord Developer Portal. Never commit the token.
3. Enable **Message Content Intent** and **Server Members Intent** in the portal. The bot also requests Guild Moderation events for audit log protection.
4. Invite the application with `bot` and `applications.commands` scopes. Grant View Channels, Send Messages, Attach Files, Read Message History, Manage Messages, Moderate Members, Kick Members, Ban Members, and View Audit Log. The setup wizard also needs Manage Channels to create channels and Manage Roles to create/assign the Verified role. Allow Use External Emojis when using icons from another server. Place its role above members it should moderate. Administrator is not required.
5. Set `GUILD_ID` for immediate slash registration in a test server. Run `npm run deploy`, then `npm start`. Without `GUILD_ID`, deploy registers global commands, which may take time to propagate. Registration replaces this application's command list in the selected scope.
6. Run `?setup` or `/setup` as a server administrator. Choose features and channels, review, then apply. Run `?help` or `/help` to browse all commands. Existing installations must restart and rerun `npm run deploy` to register the new commands and aliases.

## Features

- **General:** help with automatic category discovery, alias search, six commands per page, and navigation; ping. Exact name/alias matches appear first in search; broad searches show six results and ask you to refine the query.
- **Moderation:** purge, timeout, kick, ban. Both command paths enforce caller permissions, bot permissions, and role hierarchy. Timeout duration is 1–40,320 minutes. Purge skips messages older than 14 days.
- **Automod:** deletes Discord invites and mass mentions (5+ distinct users or everyone/here); 6 messages in 8 seconds triggers a 60-second timeout when possible. Manage Messages members are exempt. Filtered messages do not earn XP.
- **Anti-nuke:** 3 combined channel deletions, role deletions, bans, kicks, or webhook creations by one executor in 15 seconds triggers a ban. Uses new audit entries, deduplicates IDs, ignores old entries, and exempts the owner and this bot. Includes other bots and administrators. Enable only after assessing legitimate bulk moderation workflows. Requires View Audit Log and Ban Members; cannot act above its role, restore deleted resources, or guarantee prevention before damage occurs. Failure alerts go to the configured channel or process logs.
- **Leveling:** 20 XP per eligible non-command message, at most once per minute per member per server. Level = floor(sqrt(XP / 100)). Black PNG rank and top-10 leaderboard cards generated locally.
- **Economy:** balance, 500-coin daily with a rolling 24-hour cooldown, and transactional member-to-member pay. `/economy off` stops daily claims and payments while balances and admin adjustments remain available. `/leveling off` stops message XP while preserving ranks and admin adjustments. Balances and XP are isolated per server.

`?rank @member`, `?pay @member 100`, `?timeout @member 10 reason`, and their slash equivalents use the same handlers. Prefix reasons accept spaces. Menu interactions are restricted to the member who opened the menu. Responses suppress mentions.

## Command aliases

Every alias works with `?`, bot mentions, and `/`. For example, `?bal`, `@Bot bal`, and `/bal` all run `balance` with the same arguments, permissions, and cooldowns. Prefix and mention names are case insensitive. Help displays aliases and accepts them in search.

| Command | Aliases |
| --- | --- |
| addxp | addexp |
| removexp | removeexp |
| setxp | setexp |
| resetxp | resetexp |
| addbalance | addcoins |
| removebalance | removecoins |
| setbalance | setcoins |
| resetbalance | resetcoins |
| setlevel | setlvl |
| resetdaily | resetclaim |
| leveling | xp-system |
| economy | eco |
| setemoji | emoji |
| emojis | icons |
| honeypot | trap |
| verification | verifyconfig |
| setup | wizard |
| untimeout | unmute |
| unban | pardon |
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

## Guided setup

Use `/setup` (`?setup`, alias `wizard`). Only the administrator who opens the wizard can use it; Administrator permission is checked again on every interaction. Drafts expire after 15 minutes or a bot restart. Opening a new wizard replaces that administrator's previous draft in the server.

1. **Features:** choose automod, anti-nuke, leveling, economy, honeypot, and verification. First-time setup selects all features; later runs load current settings. Unselected features are disabled on Apply.
2. **Logs:** select an existing text channel or leave empty to create private `#aio-logs`.
3. **Honeypot:** select a dedicated channel or leave empty to create `#honeypot`; select timeout, kick, or ban. The default timeout is one hour.
4. **Verification:** select a channel and a permissionless role, or leave empty to create read-only `#verify` and a Verified role. Choose whether to create a gated `#members` channel (enabled by default).
5. **Review and Apply:** the wizard checks bot permissions and supplied resources, creates missing resources, posts panels, and saves configuration. Cancel leaves configuration unchanged. Failed application attempts remove newly created resources/messages and report any cleanup failures. Existing channels/roles are never deleted by rollback.

The optional new `#members` channel denies View Channel to @everyone and allows the Verified role. Its channel and role IDs are saved and reused on subsequent setup runs. Choosing a different Verified role creates a new gated member channel and preserves the old one. The wizard preserves existing channel overwrites. To restrict other existing member channels, deny **View Channel** to @everyone and allow it for the Verified role on your member categories/channels. Keep verification and honeypot channels visible to new members. The newly created log channel is private. Other existing roles/overwrites can still grant access, so check Discord's “View Server As Role” before relying on the gate.

Rerunning setup with current selections reuses configured resources. Reposting verification invalidates the previous panel. Disabling verification preserves role assignments; disabling economy or leveling preserves stored data. XP, balances, and emoji settings are preserved by setup.

## Admin controls

All commands in the **Admin** category require Administrator on both prefix and slash paths. Member adjustments are per server, retain other fields/cooldowns, and are reported to the security log (or process logs when no log channel is set). Amounts are integers from 0 to 1,000,000,000 per adjustment; removal clamps at zero.

```text
?addxp @member 250
?removexp @member 100
?setxp @member 500
?resetxp @member
?setlevel @member 10
?addbalance @member 500
?removebalance @member 100
?setbalance @member 2000
?resetbalance @member
?resetdaily @member
?leveling off
?economy on
```

`setlevel` accepts 0–3162 and sets XP to `level² × 100`. `resetdaily` lets that member claim again immediately. Admin adjustments work while their system is disabled. `/untimeout` and `/unban` also provide reversal of moderation actions using the original moderation permissions and hierarchy checks (`unban` takes a user ID).

Use `/settings` for a summary of every system and channel. Individual security controls remain available through `/automod`, `/antinuke`, `/logchannel`, `/honeypot`, and `/verification`.

## Custom emojis

Manually edit **config/emojis.json** and replace `null` values with quoted Discord emoji IDs or full markup, then restart. The keys include home, search, close, security, leveling, economy, general, moderation, admin, setup, verify, success, and error.

```json
{
  "home": "123456789012345678",
  "search": "<a:search:234567890123456789>",
  "verify": "<:verified:345678901234567890>"
}
```

The example IDs are placeholders. Keep other keys as `null` to use standard icons. A bare ID is treated as a static custom emoji; use `<a:name:id>` for animated icons. The bot must be able to use each emoji, and Use External Emojis is needed for icons from another server.

Per-server overrides can be changed without restarting:

```text
?setemoji home 123456789012345678
?setemoji verify <:verified:345678901234567890>
?setemoji home clear
?emojis
```

`clear` removes the server override and restores the file value or standard icon. Overrides are persisted in SQLite. Help headers, category icons, navigation buttons, setup headings, admin confirmations, and verification panels use these settings. Open a new menu to refresh existing help messages; rerun `/verification on` to refresh its panel. Rank/leaderboard images keep their simple black style.

## Honeypot and verification

```text
?honeypot on #honeypot timeout
?honeypot on #honeypot kick
?honeypot off
?verification on #verify @Verified
?verification off
```

Channel and role IDs work in place of mentions. Slash commands offer channel/role pickers. Both features are disabled until explicitly configured or applied by the wizard.

**Honeypot:** non-bot, non-webhook messages in the selected channel are deleted and trigger the configured punishment. Owners and administrators are exempt. Repeat actions for the same member are suppressed for 60 seconds. Messages handled by the honeypot do not run commands or earn XP. Missing permissions or role hierarchy prevent punishment and produce alerts. Use a dedicated trap channel; logs and verification cannot share it. A warning is posted whenever enabled.

**Verification:** a persistent Verify button grants only the configured Verified role. It works across restarts because its message/channel/role IDs are stored in SQLite. Old panels, disabled verification, already verified members, privileged roles, managed roles, @everyone, roles above the bot, and privileged channel overrides are checked. The role must have no server permissions; use channel View/Send overrides for member access. Verification uses a button rather than a CAPTCHA; a click alone cannot prove that an account is human. It does not remove roles, kick unverified members, or rewrite existing channel permissions.

## Data and operations

SQLite is stored at `DATABASE_PATH` (default `./data/bot.sqlite`), with WAL enabled. Mount `data/` on persistent storage. Run one process per database. Use SQLite's backup API or stop the bot before copying the database and WAL files. Protection counters and command cooldowns are in memory and reset on restart. No external image services or paid APIs are used.

Run `npm test` and `npm run check`. Tests use in-memory databases and synthetic Discord data; a real test guild is required to verify Gateway delivery, Discord permissions, live component rendering, and moderation effects. This project contains no web dashboard or music player.

Add commands in `src/commands.js`, including a unique `aliases` array, category, description, options, permissions, and handler. They appear in help immediately after restart; rerun `npm run deploy` to update slash commands.
