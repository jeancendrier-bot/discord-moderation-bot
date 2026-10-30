import { GuildVerificationLevel, PermissionFlagsBits } from 'discord.js';
import { getGuild, save } from './store.js';

const spamWindows = new Map();
const spamCooldowns = new Map();
const joinWindows = new Map();
const raidTimers = new Map();
const activeRaids = new Set();
let messageCount = 0;

const text = {
  fr: {
    linkDm: 'Votre message a été supprimé, car les liens ne sont pas autorisés sur ce serveur.',
    spamDm: (count) => `Vos messages ont été supprimés (${count}) et votre prise de parole a été suspendue automatiquement pour comportement assimilé à du spam.`,
    linkLog: (user, channel, deleted) => deleted
      ? `Le filtre anti-liens a supprimé un message de <@${user}> dans <#${channel}>.`
      : `Le filtre anti-liens a détecté un lien de <@${user}> dans <#${channel}>, mais le bot n’a pas pu supprimer le message.`,
    spamLog: (user, channel, duration, applied, deleted) => applied
      ? `Le filtre anti-spam a supprimé ${deleted} message(s) de <@${user}> dans <#${channel}> et appliqué une suspension de ${duration} minute(s).`
      : `Le filtre anti-spam a détecté des messages répétés de <@${user}> dans <#${channel}> (suppression : ${deleted} message(s)), mais le bot n’a pas pu appliquer la suspension.`,
    raidLog: (count, duration) => `Une arrivée massive a été détectée (${count} nouveaux membres). Le niveau de vérification du serveur a été renforcé pour ${duration} minute(s).`,
    restoreError: 'La restauration du niveau de vérification après la protection anti-raid a échoué.',
  },
  en: {
    linkDm: 'Your message was removed because links are not allowed on this server.',
    spamDm: (count) => `Your messages were removed (${count}) and you were automatically timed out for spam-like behavior.`,
    linkLog: (user, channel, deleted) => deleted
      ? `Anti-link protection removed a message from <@${user}> in <#${channel}>.`
      : `Anti-link protection detected a link from <@${user}> in <#${channel}>, but the bot could not remove the message.`,
    spamLog: (user, channel, duration, applied, deleted) => applied
      ? `Anti-spam protection removed ${deleted} message(s) from <@${user}> in <#${channel}> and applied a ${duration}-minute timeout.`
      : `Anti-spam protection detected repeated messages from <@${user}> in <#${channel}> (removed: ${deleted}), but the bot could not apply the timeout.`,
    raidLog: (count, duration) => `A join raid was detected (${count} new members). Server verification was raised for ${duration} minute(s).`,
    restoreError: 'Restoring the server verification level after raid protection failed.',
  },
};

function messagesFor(settings) {
  return text[settings.security.language] ?? text.fr;
}

async function sendLog(guild, settings, content) {
  if (!settings.logChannelId) return;
  const channel = guild.channels.cache.get(settings.logChannelId);
  if (channel?.isTextBased()) {
    await channel.send({ content, allowedMentions: { parse: [] } }).catch((error) => {
      console.error('[moderation-bot] Impossible de publier une alerte de sécurité :', error.message);
    });
  }
}

function isExempt(settings, member) {
  if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return true;
  const exemptRoleId = settings.security.antiLink.exemptRoleId;
  return Boolean(exemptRoleId && member.roles.cache.has(exemptRoleId));
}

function hasBlockedLink(content, mode) {
  const invites = /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/[\w-]+/i;
  if (invites.test(content)) return true;
  if (mode === 'all') return /(?:https?:\/\/|www\.)[^\s<>]+|\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?::\d+)?(?:\/[^\s<>]*)?/i.test(content);
  return false;
}

async function restoreVerificationLevel(guild, settings, reason) {
  const protection = settings.security.raidProtection;
  if (!protection) return;
  await guild.setVerificationLevel(protection.originalVerificationLevel, reason);
  settings.security.raidProtection = null;
  await save();
  raidTimers.delete(guild.id);
}

export async function handleMessageCreate(message) {
  if (!message.inGuild() || message.author.bot) return;
  const settings = await getGuild(message.guildId);
  const security = settings.security;
  const words = messagesFor(settings);
  let member = message.member;
  if (!member) {
    try {
      member = await message.guild.members.fetch(message.author.id);
    } catch (error) {
      if (Number(error.code) !== 10007) throw error;
      return;
    }
  }
  if (!member) return;

  if (security.antiLink.enabled && !isExempt(settings, member) && hasBlockedLink(message.content, security.antiLink.mode)) {
    const deleted = await message.delete().then(() => true).catch(() => false);
    if (deleted) await message.author.send(`**${message.guild.name}**\n${words.linkDm}`).catch(() => {});
    await sendLog(message.guild, settings, words.linkLog(message.author.id, message.channelId, deleted));
    return;
  }

  if (!security.antiSpam.enabled || member.permissions.has(PermissionFlagsBits.ManageMessages)) return;
  const key = `${message.guildId}:${message.author.id}`;
  const now = Date.now();
  const cooldownUntil = spamCooldowns.get(key) ?? 0;
  if (cooldownUntil > now) return;
  if (cooldownUntil) spamCooldowns.delete(key);
  const windowMs = security.antiSpam.intervalSeconds * 1000;
  const recent = (spamWindows.get(key) ?? []).filter((entry) => now - entry.at < windowMs);
  recent.push({ at: now, message });
  spamWindows.set(key, recent);

  if (++messageCount % 500 === 0) {
    for (const [userKey, entries] of spamWindows) {
      if (entries.length === 0 || now - entries.at(-1).at > 60_000) spamWindows.delete(userKey);
    }
    for (const [userKey, expiresAt] of spamCooldowns) {
      if (expiresAt <= now) spamCooldowns.delete(userKey);
    }
  }
  if (recent.length < security.antiSpam.maxMessages) return;

  spamCooldowns.set(key, now + 60_000);
  spamWindows.delete(key);
  const deletionResults = await Promise.allSettled(recent.map(({ message: spamMessage }) => spamMessage.delete()));
  const deletedCount = deletionResults.filter((result) => result.status === 'fulfilled').length;
  const botMember = message.guild.members.me;
  if (member.id === message.guild.ownerId || (botMember && member.roles.highest.position >= botMember.roles.highest.position)) {
    await sendLog(message.guild, settings, words.spamLog(member.id, message.channelId, security.antiSpam.timeoutMinutes, false, deletedCount));
    return;
  }

  let timeoutApplied = false;
  try {
    await member.timeout(security.antiSpam.timeoutMinutes * 60_000, 'Protection anti-spam automatique');
    timeoutApplied = true;
    await member.user.send(`**${message.guild.name}**\n${words.spamDm(deletedCount)}`).catch(() => {});
  } catch (error) {
    console.error('[moderation-bot] Application de la mesure anti-spam impossible :', error.message);
  }
  await sendLog(message.guild, settings, words.spamLog(member.id, message.channelId, security.antiSpam.timeoutMinutes, timeoutApplied, deletedCount));
}

function scheduleRaidRestore(guild, settings) {
  const currentTimer = raidTimers.get(guild.id);
  if (currentTimer) clearTimeout(currentTimer);
  const restoreAt = settings.security.raidProtection?.restoreAt;
  if (!restoreAt) return;

  const timer = setTimeout(async () => {
    try {
      await restoreVerificationLevel(guild, settings, 'Fin de la protection anti-raid temporaire');
    } catch (error) {
      const words = messagesFor(settings);
      console.error(`[moderation-bot] ${words.restoreError}`, error.message);
      await sendLog(guild, settings, words.restoreError);
      settings.security.raidProtection.restoreAt = Date.now() + 60_000;
      await save().catch(() => {});
      scheduleRaidRestore(guild, settings);
    }
  }, Math.max(0, restoreAt - Date.now()));
  timer.unref();
  raidTimers.set(guild.id, timer);
}

export async function handleGuildMemberAdd(member) {
  const settings = await getGuild(member.guild.id);
  const antiRaid = settings.security.antiRaid;
  if (!antiRaid.enabled) return;

  const now = Date.now();
  const joins = (joinWindows.get(member.guild.id) ?? []).filter((joinedAt) => now - joinedAt < antiRaid.intervalSeconds * 1000);
  joins.push(now);
  joinWindows.set(member.guild.id, joins);
  if (settings.security.raidProtection && settings.security.raidProtection.restoreAt <= now) {
    try {
      await restoreVerificationLevel(member.guild, settings, 'Restauration avant une nouvelle protection anti-raid');
    } catch (error) {
      console.error('[moderation-bot] Restauration anti-raid préalable impossible :', error.message);
      return;
    }
  }
  if (joins.length < antiRaid.joinThreshold || settings.security.raidProtection?.restoreAt > now || activeRaids.has(member.guild.id)) return;

  activeRaids.add(member.guild.id);
  const originalVerificationLevel = member.guild.verificationLevel;
  const restoreAt = now + antiRaid.protectionMinutes * 60_000;
  settings.security.raidProtection = { originalVerificationLevel, restoreAt };
  try {
    await save();
    await member.guild.setVerificationLevel(GuildVerificationLevel.VeryHigh, 'Arrivées massives détectées par la protection anti-raid');
    scheduleRaidRestore(member.guild, settings);
    const words = messagesFor(settings);
    await sendLog(member.guild, settings, words.raidLog(joins.length, antiRaid.protectionMinutes));
  } catch (error) {
    settings.security.raidProtection = null;
    await save().catch(() => {});
    console.error('[moderation-bot] Activation de la protection anti-raid impossible :', error.message);
  } finally {
    activeRaids.delete(member.guild.id);
  }
}

export async function restoreRaidProtection(client) {
  for (const guild of client.guilds.cache.values()) {
    const settings = await getGuild(guild.id);
    if (!settings.security.raidProtection?.restoreAt) continue;
    if (settings.security.raidProtection.restoreAt <= Date.now()) {
      try {
        await restoreVerificationLevel(guild, settings, 'Restauration de la configuration anti-raid après redémarrage');
      } catch (error) {
        console.error('[moderation-bot] Restauration de la protection anti-raid impossible :', error.message);
      }
      continue;
    }
    scheduleRaidRestore(guild, settings);
  }
}
