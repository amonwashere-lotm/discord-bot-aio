# Kuroo · Discord bot

JavaScript / Node 24 bot with Discord Components v2, `?` prefix, slash commands, and mention commands. The help menu follows the supplied dark, category-based reference with Home, Search, Close, and Invite controls. Categories and command descriptions come from one command registry.

## Run

1. Install Node.js 24 or later, then run `npm ci`.
2. Copy `.env.example` to `.env`. Set a bot token and application/client ID from the Discord Developer Portal. Never commit the token.
3. Enable **Message Content Intent** and **Server Members Intent** in the portal. The bot also requests Guild Moderation events for audit log protection.
4. Invite the application with `bot` and `applications.commands` scopes. Grant View Channels, Send Messages, Attach Files, Read Message History, Manage Messages, Moderate Members, Kick Members, Ban Members, and View Audit Log. The setup wizard also needs Manage Channels to create channels and Manage Roles to create/assign the Verified role. Allow Use External Emojis when using icons from another server. Place its role above members it should moderate. Administrator is not required.
5. Set `GUILD_ID` for immediate slash registration in a test server. Run `npm run deploy`, then `npm start`. Without `GUILD_ID`, deploy registers global commands, which may take time to propagate. Registration replaces this application's command list in the selected scope.
6. Run `?setup` or `/setup` as a server administrator. Choose features and channels, review, then apply. Run `?help` or `/help` to browse all commands. Existing installations must restart and rerun `npm run deploy` to register the new commands and aliases.

## Kuroo branding and streaming presence

At startup the bot requests the username **Kuroo** if it differs. Discord can rate-limit/reject a profile rename; failures are logged while the bot continues. Existing guild nicknames and the Developer Portal application name are separate Discord settings.

The presence uses **Streaming** for every frame, with a 15-second rotation:

1. `Indestructible Defence ?help`
2. `Watching over n servers`
3. `Looking after n users`

Counts are refreshed from the bot’s current guild cache on each frame. Users is the sum of server member counts, including bots and repeat memberships across servers. No members are fetched solely for this status.

Set `STREAMING_URL` in `.env` to your HTTPS Twitch channel or YouTube channel/video URL. The fallback is `https://www.twitch.tv/kuroo`; it is an activity link, not a provisioned channel. The Streaming type and supported URL request Discord’s purple streaming indicator. Confirm its appearance in your Discord client after restarting. All frames keep the Streaming activity type even when the message starts with “Watching”. The prefix remains `?`.

## Features

- **General:** help with automatic category discovery, alias search, six commands per page, and navigation; ping. Exact name/alias matches appear first in search; broad searches show six results and ask you to refine the query.
- **Moderation:** purge, timeout, kick, ban. Both command paths enforce caller permissions, bot permissions, and role hierarchy. Timeout duration is 1–40,320 minutes. Purge skips messages older than 14 days.
- **Automod:** checks new and edited messages, normalizes zero-width characters, and filters invites, mentions, duplicate spam, configurable links, blocked words and excessive capitals. Defaults: 6 messages in 8 seconds, 4 duplicates in 30 seconds, 5 user/role mentions; spam triggers a 60-second timeout. Manage Messages members and configured exemptions are skipped. Filtered messages do not earn XP.
- **Anti-nuke:** 3 combined sensitive audit events by one executor in 15 seconds triggers a ban. Events include channel/role creation or deletion, bans, kicks, pruning, bot additions, webhook creation/deletion, and additions of dangerous role permissions or dangerous member roles. Uses new audit entries, deduplicates IDs, ignores old entries, and exempts the owner and this bot. Includes other bots and administrators. Enable only after assessing legitimate bulk moderation workflows. Requires View Audit Log and Ban Members; cannot act above its role, restore deleted resources, or guarantee prevention before damage occurs. Failure alerts go to the configured channel or process logs.
- **Leveling:** By default, 20 XP per eligible non-command message, at most once per minute per member per server; rewards and cooldowns can be tuned. Channel exclusions and up to ten safe level-role rewards are supported. Level = floor(sqrt(XP / 100)). PNG rank and top-10 leaderboard cards generated locally. Rank cards fill the background with the member’s 512px Discord avatar, centered and cropped to cover without stretching. A dark gradient keeps the text readable; download failures use the black fallback. Leaderboard cards use the server icon as a full background with the same dark overlay; servers without an icon or with failed downloads keep the black fallback.
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
| deposit | dep |
| withdraw | with |
| work | job |
| richlist | baltop |
| warn | strike |
| warnings | warns |
| clearwarnings | clearwarns |
| tune | configure |
| allowlist | exempt |
| levelrole | rewardrole |
| emojihealth | checkicons |
| diagnose | health |
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

1. **Features:** choose automod, anti-nuke, leveling, economy, honeypot, and verification. Optionally apply a Balanced or Strict security preset; Keep current tuning preserves your values. Strict selects CAPTCHA, a 24-hour minimum account age, 4 messages/8 seconds, 3 duplicates/30 seconds, a 3-mention limit and 2 anti-nuke events/15 seconds. First-time setup selects all features; later runs load current settings. Unselected features are disabled on Apply.
2. **Logs:** select an existing text channel or leave empty to create private `#kuroo-logs`.
3. **Honeypot:** select a dedicated channel or leave empty to create `#honeypot`; select timeout, kick, or ban. The default timeout is one hour, configurable through `/tune honeypotTimeoutMinutes`.
4. **Verification:** select a channel and a permissionless role, or leave empty to create read-only `#verify` and a Verified role. Choose button or CAPTCHA mode and whether to create a gated `#members` channel (enabled by default). CAPTCHA needs Attach Files in the verification channel.
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

Manually edit **config/emojis.json** and replace `null` values with quoted Discord emoji IDs or full markup, then restart. Keys and placements are listed below. Defaults use standard icons until you supply your own IDs.

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

`clear` removes the server override and restores the file value or standard icon. Overrides are persisted in SQLite. Help headers, category lists, command rows, dropdown options, navigation buttons, setup controls, command confirmations, verification panels, wallet amounts and security alerts use these settings. Open a new menu to refresh existing help messages; rerun `/verification on` to refresh its panel. Rank and leaderboard text is drawn on canvas and does not use Discord custom emojis.


### Emoji placement map

Inspired by AeroX Development’s help layouts; see [source notes](docs/GITHUB-SOURCES.md#kuroo-emoji-placement-reference).

| Keys | Placement |
| --- | --- |
| `home`, `search`, `close`, `invite` | Help heading, menu options, Home/Search/Close/Invite buttons; closed menu |
| `previous`, `next` | Help pagination and setup Back/Next buttons |
| `security`, `leveling`, `economy`, `general`, `moderation`, `admin` | Help categories/headings and command reply icons; `security` also labels alerts |
| `reply`, `bullet` | Help category/command rows and alias lines |
| `setup`, `success` | Wizard heading and Apply/completion controls |
| `enabled`, `disabled` | Feature states in settings and the setup review |
| `verify` | Verification heading, Verify and Enter code buttons |
| `coin`, `bank` | Wallet and bank amounts in `/balance` |
| `error` | Command failures and invalid prefix arguments |

Existing emoji overrides remain valid. New keys default to standard icons. Emoji IDs from the reference bots are not bundled; configure icons you can use with `/setemoji` or `config/emojis.json`.

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

**Verification:** a persistent Verify button grants only the configured Verified role. It works across restarts because its message/channel/role IDs are stored in SQLite. Old panels, disabled verification, already verified members, privileged roles, managed roles, @everyone, roles above the bot, and privileged channel overrides are checked. The role must have no server permissions; use channel View/Send overrides for member access. Button mode is the default; `/tune verificationMode captcha` enables a locally generated six-character image challenge with a modal answer form, three attempts, a three-minute expiry and a 30-second regeneration cooldown. Challenges bind to the member, guild, configured role and panel, are consumed once, and expire on restart. `/tune verifyMinAgeHours 24` requires a one-day-old account. A CAPTCHA adds friction but cannot guarantee that an operator is human. It does not remove roles, kick unverified members, or rewrite existing channel permissions.

## GitHub-informed module improvements

See [GitHub sources and license notes](docs/GITHUB-SOURCES.md) for pinned source revisions and the pattern adopted by each module. MIT adaptation notices are in `third-party-notices/`.

### Configuration and diagnostics

```text
?tune
?tune spamCount 5
?tune duplicateCount 4
?tune blockedWords badword,bad phrase
?tune blockedWords clear
?tune blockLinks on
?tune antinukeCount 3
?tune xpAmount 30
?tune dailyAmount 750
?tune verificationMode captcha
?tune verifyMinAgeHours 24
?diagnose
?emojihealth
```

`/tune` lists all current settings. All tuning writes require Administrator. The setting menu includes ranges enforced for both prefix and slash commands. `/diagnose` checks module permissions, channel access and the verification role. `/emojihealth` checks known bot/application emoji metadata; unknown cache entries may need access checks in Discord. A bare emoji ID is normalized to animated markup when the bot already knows its metadata.

```text
?allowlist automod-channel add #bot-commands
?allowlist automod-role add @Trusted
?allowlist automod-user add @member
?allowlist honeypot-user add @member
?allowlist leveling-channel add #no-xp
?allowlist antinuke-user add @trusted-admin
?allowlist automod-channel list
?allowlist automod-channel remove #bot-commands
```

Only the **server owner** can manage anti-nuke exemptions. Other exemption scopes require Administrator. Each scope allows 50 IDs. Leveling-channel entries exclude XP in those channels. Existing owner/bot/admin protections still apply.

### Economy and moderation

```text
?deposit 500
?withdraw 200
?work
?richlist
?warn @member repeated disruption
?warnings @member
?clearwarnings @member
```

Wallet and bank transfers update both fields atomically; payments use wallet coins. Work defaults to 200 coins once per hour and persists its cooldown across restarts. `/balance` shows both balances; `/richlist` ranks their combined totals. Disabling economy blocks work, daily claims, payments and bank movement, while views and admin adjustments remain available. `/tune` supports work/daily amounts and cooldowns. Existing admin balance commands adjust wallet coins.

Warnings require Moderate Members and respect caller hierarchy. The most recent ten are shown, with long reasons shortened for display. Warning records remain in SQLite until cleared. Automatic protection and admin event logs are also persisted in the `incidents` table, bounded to the latest 1,000 per guild; no raw message content is stored for spam tracking.

### Level-role rewards and help

```text
?levelrole 5 @Active
?levelrole 10 @Regular
?levelrole 5
?help deposit
```

Omitting the role removes that reward configuration. Reward roles must be unmanaged, permissionless, below the bot and free of privileged channel overrides. Eligible members receive all missing configured reward roles on their next accepted XP message. Existing role assignments remain when rewards are removed or XP is lowered. Help accepts command names, aliases or keywords directly, as well as through its search button.

## Data and operations

SQLite is stored at `DATABASE_PATH` (default `./data/bot.sqlite`), with WAL enabled. Mount `data/` on persistent storage. Run one process per database. Use SQLite's backup API or stop the bot before copying the database and WAL files. Protection counters, short command cooldowns and pending CAPTCHA challenges are in memory and reset on restart. XP, daily/work cooldowns, bank balances, warnings and configuration persist. Startup automatically adds bank/work columns and warning/incident tables to existing databases; back up data before upgrading. Rank avatars are fetched only from Discord CDN URLs; rendering and CAPTCHA generation are local. No paid APIs are used.

Run `npm test` and `npm run check`. Tests use in-memory databases and synthetic Discord data; a real test guild is required to verify Gateway delivery, Discord permissions, live component rendering, and moderation effects. This project contains no web dashboard or music player.

Add commands in `src/commands.js`, including a unique `aliases` array, category, description, options, permissions, and handler. They appear in help immediately after restart; rerun `npm run deploy` to update slash commands.


### Help appearance and streaming profile

Help uses the reference layout with a Kuroo greeting, bot avatar thumbnail, actual command count, emoji module list, invite link, module selector and footer. Categories still come from the command registry. If the bot user has a cached profile banner, it appears above the selector. Search, pagination and owner-only controls remain available.

The purple play indicator and **Watch** button are Discord's UI for a Streaming activity with a supported Twitch/YouTube URL. All three 15-second rotation frames use that activity type. Set `STREAMING_URL` to your channel and restart the bot. Discord controls how the indicator appears in each client; there is no separate purple-button setting.


### Troubleshooting a missing Streaming activity

1. Update the running checkout from `main` and restart **the bot process**, using `npm start` (`src/index.js`).
2. Look for `[presence:streaming-v2]` in startup logs. Its bot ID must match the profile you are checking. It reports the configured provider and 15-second rotation without exposing the token.
3. Run `/diagnose` as an administrator to inspect the local Streaming activity and bot ID. This is local state, not a Discord server acknowledgement.
4. Set `STREAMING_URL=https://www.twitch.tv/your_channel` in `.env` or your hosting environment. An omitted/blank value uses the default. Use a real channel you control for the Watch destination.
5. Stop any old deployments or other processes logging in with the same token. Refresh the Discord profile after restarting. Check from another Discord client/account if needed.

The bot now includes Streaming in its initial Gateway login presence as well as all subsequent updates. Publishing your own presence does not require the Guild Presences intent. If the marker and local activity are correct but Discord still displays Online, collect the sanitized startup logs and deployment revision for further investigation; the local diagnostic alone cannot establish the cause.

For live testing, put a dedicated test bot token in the ignored `.env` file as `DISCORD_TOKEN` using the workspace editor or your host's secret settings. Do not post it in chat or commit it. Keep only one test process running during observation.
