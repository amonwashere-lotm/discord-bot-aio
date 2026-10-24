# GitHub research and implemented patterns

Reviewed 2026-10-24. Repository searches covered Discord automod/anti-nuke, leveling/rank cards, economy, and verification. The selected repositories below were not archived when inspected. References pin the actual revision read. No fetched scripts were executed.

The changes adapt the selected algorithms and workflows into this project's JavaScript modules, SQLite persistence, Components v2 UI, and existing permission checks. They are not drop-in installations of the upstream bots. MIT license notices for the four adaptation sources are retained in `third-party-notices/`. Existing discord.js and @napi-rs/canvas packages retain their own package licenses. No additional runtime dependency was needed.

| Source and inspected revision | Files reviewed | Applied here |
| --- | --- | --- |
| [Michael-J-Scofield/discord-anti-spam](https://github.com/Michael-J-Scofield/discord-anti-spam/tree/9c40ecc3cceb401115ebb19f88b75b996ff1a510) · MIT | [index.ts](https://github.com/Michael-J-Scofield/discord-anti-spam/blob/9c40ecc3cceb401115ebb19f88b75b996ff1a510/index.ts) | `protection.js`: bounded message windows, duplicate counts, user/role/channel exemptions. Message edits update an existing entry rather than increasing its count. |
| [ItzMePara9/RyzenXSecurity](https://github.com/ItzMePara9/RyzenXSecurity/tree/87f271e7dce6a3ccb93d778361bbabd896db1601) · MIT | `src/events/security.js`, `automod.js`, `verification.js`; `src/utils/emojiSync.js`; automod/verification command configuration | `protection.js`: sensitive audit actions, dangerous-permission bitmasks, configurable filters and persistent incident history. `challenges.js`/`verification.js`: image challenge + button/modal flow. `settings.js`/`setup.js`: shared module settings and presets. `diagnostics.js`/`admin.js`: emoji-cache inspection and canonical metadata. |
| [SpaghettDev/Economy-Bot](https://github.com/SpaghettDev/Economy-Bot/tree/0e870c1d03f9c7da8f71a6c1d1bf100d0e90c33c) · MIT | `Commands/Economy/deposit.js`, `withdraw.js`, `work.js`; `Commands/Utility/leaderboard.js` | `store.js`/`extensions.js`: wallet/bank separation, work cooldown and wealth leaderboard. Money movements use a single conditional SQLite update; payments retain the existing transaction. |
| [krishsharma0413/DiscordLevelingCard](https://github.com/krishsharma0413/DiscordLevelingCard/tree/44a28738e8855ce0a6b5d68627d0187e462906be) · MIT | `DiscordLevelingCard/discord_card.py` | `cards.js`/`avatar.js`: circular avatar composition and measured text placement, implemented with the existing canvas renderer and black theme. Avatar retrieval is restricted to Discord CDN URLs with time/size limits. |
| [discordjs/discord.js](https://github.com/discordjs/discord.js/tree/5050a3b54c107c3229dd76da52e0cb77dba1b6be) · Apache-2.0 | `packages/discord.js/src/structures/GuildAuditLogsEntry.js`, `managers/GuildEmojiManager.js`; active repository's `apps/guide/content/docs/legacy/additional-features/cooldowns.mdx` | Confirmed audit changes expose `old`/`new`, emoji manager fetch/cache behavior, and command cooldown conventions. Runtime calls continue through the installed discord.js API and its rate-limit handling. No official source files were vendored. |

Also examined `diwasatreya/Verification-Bot` at `46db038f3c8fe85a3ac7ced2cd2b6e60c2a47aa4` (Apache-2.0) for its role/channel verification workflow; the selected challenge design comes from the MIT security source above. Repositories without clear license metadata were not used as adaptation sources. The archived standalone discordjs guide was excluded; API/guide references use the active discord.js repository.

## Coverage by existing module

- **Automod:** duplicate spam, message edits, configurable invite/link/caps/blocked-term/mention rules and exemptions.
- **Anti-nuke:** creation/destruction, bot additions, pruning and dangerous role grants, configurable windows, owner-managed trusted users, repeated-action suppression.
- **Moderation:** persistent warnings and warning removal; security incident history retained in SQLite (latest 1,000 per guild).
- **Honeypot:** configurable timeout duration and user exemptions using the same validated settings system.
- **Leveling:** configurable XP/cooldown, excluded channels, safe cumulative role rewards; original level formula preserved.
- **Rank/leaderboard images:** circular Discord avatar, measured name truncation and bounded image fetches.
- **Economy:** bank, deposit/withdraw, durable work rewards, wealth leaderboard, configurable daily amount/cooldown.
- **Verification:** optional CAPTCHA, account-age gate, identity-bound challenges, three attempts, expiry and replay protection; button mode remains default.
- **Setup/admin:** validated tuning, strict/balanced presets, diagnostics and role/permission checks; existing wizard rollback behavior retained.
- **Emojis:** available metadata determines static/animated markup when setting an ID; diagnostics report unknown IDs; manual configuration remains supported.
- **Help/hybrid commands:** direct `/help query` / `?help query`, existing pagination/alias discovery, all new commands share prefix/slash handlers.

## Compatibility and limits

Existing database balances, XP, settings and role assignments are preserved. Migration adds bank/work columns and warning/incident tables. Defaults remain 20 XP per minute and 500 daily coins every 24 hours. New duplicate filtering runs when automod is enabled; anti-nuke's expanded actions count toward its existing default of three events in 15 seconds. The Strict wizard preset explicitly changes selected defaults and previews them before Apply.

Anti-nuke counts events and bans an executable actor when possible. Deleted resources and granted permissions require moderator recovery; the bot does not promise preemptive protection. A local image CAPTCHA adds friction but is not proof of a human operator. Runtime role hierarchy, portal intents, Discord component rendering and external emoji availability still require a live guild check.

## Kuroo emoji placement reference

Reviewed 2026-10-24. GitHub search for “AeroX Development” located these non-archived repositories:

- [itsfizys/AeroX-All-In-One-Bot-V1](https://github.com/itsfizys/AeroX-All-In-One-Bot-V1/blob/79adce104d9505ba574ba36fc2a0746547f8706b/AeroX-AIO-V1/Commands/Information/help.js): custom icons in section headings, module rows with reply markers, dropdown options and navigation. Also inspected its moderation `ban.js`, utility `rank.js`, and client `ready.js` at that revision.
- [itsfizys/Melon-All-In-One-Discord-Bot](https://github.com/itsfizys/Melon-All-In-One-Discord-Bot/tree/ba6362e7353cdb13323f4167ad318092e2595edc): inspected `src/lib/helpMenu.js` and `src/emojis.json` for menu structure and semantic icon categories.

These are visual placement references. GitHub reported no standard license for the first and NOASSERTION for the second. No source code, custom emoji IDs, images, banners or branding from either repository were copied. Kuroo’s existing Components v2 renderer now places its own manually configurable icons in headings, category lists, command rows, menus, navigation, setup, verification, command replies and security alerts. The implementation uses the existing emoji resolver and Unicode fallbacks.
