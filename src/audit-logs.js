import { EmbedBuilder } from 'discord.js';
import { getGuild } from './store.js';

const colors = {
  info: 0x5865f2,
  success: 0x57f287,
  warning: 0xe67e22,
  danger: 0xed4245,
};

function excerpt(value, limit = 900) {
  const text = String(value || '').trim();
  if (!text) return '*Aucun texte*';
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

async function sendAuditLog(guild, title, description, color = colors.info) {
  if (!guild?.id) return false;
  const settings = await getGuild(guild.id);
  if (!settings.logChannelId) return false;

  const channel = guild.channels.cache.get(settings.logChannelId)
    ?? await guild.channels.fetch(settings.logChannelId);
  if (!channel?.isTextBased() || typeof channel.send !== 'function') {
    throw new Error(`Le salon de journal configuré (${settings.logChannelId}) est introuvable ou ne permet pas l’envoi de messages.`);
  }

  await channel.send({
    embeds: [new EmbedBuilder()
      .setColor(color)
      .setTitle(title.slice(0, 256))
      .setDescription(excerpt(description, 4000))
      .setTimestamp()],
    allowedMentions: { parse: [] },
  });
  return true;
}

export async function logAuditEvent(guild, title, description, color) {
  return sendAuditLog(guild, title, description, color);
}

export async function handleAuditMessageDelete(message) {
  if (!message.guild || message.author?.bot) return false;
  const author = message.author ? `<@${message.author.id}>` : 'Auteur inconnu';
  const content = message.partial ? 'Contenu indisponible (message non chargé en cache).' : excerpt(message.content, 900);
  const attachments = message.attachments?.size ? `\nPièces jointes : ${message.attachments.size}` : '';
  return sendAuditLog(
    message.guild,
    'Message supprimé',
    `Auteur : ${author}\nSalon : <#${message.channelId}>\nContenu : ${content}${attachments}`,
    colors.danger,
  );
}

export async function handleAuditBulkMessageDelete(messages, channel) {
  if (!channel.guild) return false;
  const humanMessages = messages.filter((message) => !message.author?.bot);
  if (!humanMessages.size) return false;
  return sendAuditLog(
    channel.guild,
    'Messages supprimés en masse',
    `${humanMessages.size} message(s) supprimé(s) dans <#${channel.id}>.`,
    colors.danger,
  );
}

export async function handleAuditMessageUpdate(oldMessage, newMessage) {
  if (!newMessage.guild || newMessage.author?.bot) return false;
  if (oldMessage.partial || newMessage.partial || oldMessage.content === newMessage.content) return false;
  return sendAuditLog(
    newMessage.guild,
    'Message modifié',
    `Auteur : <@${newMessage.author.id}>\nSalon : <#${newMessage.channelId}>\nAvant : ${excerpt(oldMessage.content)}\nAprès : ${excerpt(newMessage.content)}`,
    colors.warning,
  );
}

export async function handleAuditMemberUpdate(oldMember, newMember) {
  const changes = [];
  const oldRoleIds = new Set(oldMember.roles.cache.keys());
  const newRoleIds = new Set(newMember.roles.cache.keys());
  const addedRoles = [...newRoleIds].filter((id) => !oldRoleIds.has(id) && id !== newMember.guild.id);
  const removedRoles = [...oldRoleIds].filter((id) => !newRoleIds.has(id) && id !== newMember.guild.id);
  if (addedRoles.length) changes.push(`Rôles ajoutés : ${addedRoles.map((id) => `<@&${id}>`).join(', ')}`);
  if (removedRoles.length) changes.push(`Rôles retirés : ${removedRoles.map((id) => `<@&${id}>`).join(', ')}`);
  if (oldMember.nickname !== newMember.nickname) {
    changes.push(`Pseudonyme : ${excerpt(oldMember.nickname || oldMember.user.username, 100)} → ${excerpt(newMember.nickname || newMember.user.username, 100)}`);
  }
  if (oldMember.communicationDisabledUntilTimestamp !== newMember.communicationDisabledUntilTimestamp) {
    const until = newMember.communicationDisabledUntilTimestamp;
    changes.push(until ? `Timeout jusqu’au <t:${Math.floor(until / 1000)}:F>` : 'Timeout retiré');
  }
  if (!changes.length) return false;
  return sendAuditLog(
    newMember.guild,
    'Membre modifié',
    `Membre : <@${newMember.id}>\n${changes.join('\n')}`,
    colors.warning,
  );
}

export async function handleAuditRoleCreate(role) {
  return sendAuditLog(role.guild, 'Rôle créé', `Rôle : <@&${role.id}> (${excerpt(role.name, 100)})`, colors.success);
}

export async function handleAuditRoleDelete(role) {
  return sendAuditLog(role.guild, 'Rôle supprimé', `Rôle : ${excerpt(role.name, 100)} (\`${role.id}\`)`, colors.danger);
}

export async function handleAuditRoleUpdate(oldRole, newRole) {
  const changes = [];
  if (oldRole.name !== newRole.name) changes.push(`Nom : ${excerpt(oldRole.name, 100)} → ${excerpt(newRole.name, 100)}`);
  if (oldRole.color !== newRole.color) changes.push(`Couleur : ${oldRole.hexColor} → ${newRole.hexColor}`);
  if (oldRole.hoist !== newRole.hoist) changes.push(`Affiché séparément : ${newRole.hoist ? 'oui' : 'non'}`);
  if (oldRole.mentionable !== newRole.mentionable) changes.push(`Mentionnable : ${newRole.mentionable ? 'oui' : 'non'}`);
  if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) changes.push('Permissions modifiées');
  if (!changes.length) return false;
  return sendAuditLog(
    newRole.guild,
    'Rôle modifié',
    `Rôle : <@&${newRole.id}>\n${changes.join('\n')}`,
    colors.warning,
  );
}

export async function handleAuditChannelCreate(channel) {
  if (!channel.guild) return false;
  return sendAuditLog(channel.guild, 'Salon créé', `Salon : <#${channel.id}> (${excerpt(channel.name, 100)})`, colors.success);
}

export async function handleAuditChannelDelete(channel) {
  if (!channel.guild) return false;
  return sendAuditLog(channel.guild, 'Salon supprimé', `Salon : ${excerpt(channel.name, 100)} (\`${channel.id}\`)`, colors.danger);
}

export async function handleAuditChannelUpdate(oldChannel, newChannel) {
  if (!newChannel.guild) return false;
  const changes = [];
  if (oldChannel.name !== newChannel.name) changes.push(`Nom : ${excerpt(oldChannel.name, 100)} → ${excerpt(newChannel.name, 100)}`);
  if (oldChannel.topic !== newChannel.topic) changes.push(`Sujet : ${excerpt(oldChannel.topic, 300)} → ${excerpt(newChannel.topic, 300)}`);
  if (oldChannel.parentId !== newChannel.parentId) {
    changes.push(`Catégorie : ${oldChannel.parentId ? `<#${oldChannel.parentId}>` : 'aucune'} → ${newChannel.parentId ? `<#${newChannel.parentId}>` : 'aucune'}`);
  }
  if (oldChannel.nsfw !== newChannel.nsfw) changes.push(`Contenu sensible : ${newChannel.nsfw ? 'activé' : 'désactivé'}`);
  if (oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser) changes.push(`Mode lent : ${newChannel.rateLimitPerUser ?? 0} seconde(s)`);
  const oldOverwrites = oldChannel.permissionOverwrites?.cache
    ?.map((overwrite) => `${overwrite.id}:${overwrite.allow.bitfield}:${overwrite.deny.bitfield}`).sort().join('|');
  const newOverwrites = newChannel.permissionOverwrites?.cache
    ?.map((overwrite) => `${overwrite.id}:${overwrite.allow.bitfield}:${overwrite.deny.bitfield}`).sort().join('|');
  if (oldOverwrites !== newOverwrites) {
    changes.push('Permissions du salon modifiées');
  }
  if (!changes.length) return false;
  return sendAuditLog(newChannel.guild, 'Salon modifié', `Salon : <#${newChannel.id}>\n${changes.join('\n')}`, colors.warning);
}

export async function handleAuditMemberJoin(member) {
  return sendAuditLog(member.guild, 'Membre arrivé', `Membre : <@${member.id}> (${excerpt(member.user.tag ?? member.user.username, 100)})`, colors.success);
}

export async function handleAuditMemberLeave(member) {
  return sendAuditLog(member.guild, 'Membre parti', `Membre : <@${member.id}> (${excerpt(member.user.tag ?? member.user.username, 100)})`, colors.warning);
}

export async function handleAuditBan(ban, added) {
  const user = ban.user;
  const reason = ban.reason ? `\nMotif : ${excerpt(ban.reason, 700)}` : '';
  return sendAuditLog(
    ban.guild,
    added ? 'Membre banni' : 'Bannissement retiré',
    `Membre : <@${user.id}> (\`${user.tag ?? user.username ?? user.id}\`)${reason}`,
    added ? colors.danger : colors.success,
  );
}

export async function handleAuditInvite(invite, created) {
  const channel = invite.channel;
  const details = [
    `Code : \`${invite.code}\``,
    channel ? `Salon : <#${channel.id}>` : null,
    invite.inviter ? `Créé par : <@${invite.inviter.id}>` : null,
    created ? `Utilisations max. : ${invite.maxUses || 'illimitées'}` : null,
  ].filter(Boolean).join('\n');
  return sendAuditLog(
    invite.guild,
    created ? 'Invitation créée' : 'Invitation supprimée',
    details,
    created ? colors.success : colors.warning,
  );
}

export async function handleAuditVoiceStateUpdate(oldState, newState) {
  const member = newState.member ?? oldState.member;
  const guild = newState.guild ?? oldState.guild;
  if (!member || !guild) return false;
  const changes = [];
  if (oldState.channelId !== newState.channelId) {
    const oldChannel = oldState.channelId ? `<#${oldState.channelId}>` : 'aucun salon';
    const newChannel = newState.channelId ? `<#${newState.channelId}>` : 'aucun salon';
    changes.push(`Salon vocal : ${oldChannel} → ${newChannel}`);
  }
  for (const [property, label] of [
    ['serverMute', 'Micro coupé par le serveur'],
    ['serverDeaf', 'Son coupé par le serveur'],
    ['selfMute', 'Micro coupé par le membre'],
    ['selfDeaf', 'Son coupé par le membre'],
  ]) {
    if (oldState[property] !== newState[property]) changes.push(`${label} : ${newState[property] ? 'oui' : 'non'}`);
  }
  if (!changes.length) return false;
  return sendAuditLog(guild, 'Activité vocale', `Membre : <@${member.id}>\n${changes.join('\n')}`, colors.info);
}
