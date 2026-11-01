import { AttachmentBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { getGuild } from './store.js';

const eventLabels = {
  welcome: 'Bienvenue',
  leave: 'Départ',
};

export async function handleGuildJoined(guild) {
  const botMember = guild.members.me ?? await guild.members.fetchMe();
  const channels = [guild.systemChannel, ...guild.channels.cache.values()]
    .filter((channel, index, list) => channel && list.indexOf(channel) === index)
    .filter((channel) => channel.isTextBased() && typeof channel.send === 'function')
    .filter((channel) => channel.permissionsFor(botMember)?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
    ]));

  const message = {
    content: `Merci d’avoir ajouté **${guild.client.user.username}** à **${guild.name}** !\n\nPour commencer : consultez \`/aide\`, puis ouvrez la rubrique voulue avec \`/config langue\`, \`/config antispam\`, \`/config bienvenue\` ou \`/config tickets\`. Après avoir réglé les tickets, publiez leur panneau avec \`/ticket panel\`.`,
    allowedMentions: { parse: [] },
  };
  for (const channel of channels) {
    try {
      await channel.send(message);
      return channel.id;
    } catch (error) {
      if (![50001, 50013, 10003].includes(error.code)) throw error;
      console.warn(`[moderation-bot] Impossible d’envoyer le message d’arrivée dans #${channel.name} (${error.code}).`);
    }
  }

  console.warn(`[moderation-bot] Aucun salon accessible pour annoncer l’arrivée du bot sur ${guild.name}.`);
  return null;
}

export async function handleBotStatus(client, state, reason = '') {
  if (!client.user) return [];
  const statuses = {
    online: { title: '🟢 Bot en ligne', color: 0x57f287, description: `**${client.user.tag}** est connecté et prêt à fonctionner sur ce serveur.` },
    reconnected: { title: '🟢 Connexion Discord rétablie', color: 0x57f287, description: `**${client.user.tag}** a retrouvé sa connexion à Discord.` },
    disconnected: { title: '🟠 Connexion Discord interrompue', color: 0xe67e22, description: `**${client.user.tag}** a perdu sa connexion à Discord et va tenter de se reconnecter${reason ? ` (code ${reason})` : ''}.` },
    offline: { title: '🔴 Bot hors ligne', color: 0xed4245, description: `**${client.user.tag}** s’arrête proprement${reason ? ` (${reason})` : ''}.` },
  };
  const status = statuses[state];
  if (!status) throw new Error(`État de bot inconnu : ${state}`);
  const results = [];
  for (const guild of client.guilds.cache.values()) {
    try {
      const settings = await getGuild(guild.id);
      const botMember = guild.members.me ?? await guild.members.fetchMe();
      const configuredChannel = settings.logChannelId
        ? await guild.channels.fetch(settings.logChannelId).catch((error) => {
          if (Number(error.code) === 10003 || Number(error.code) === 50001) return null;
          throw error;
        })
        : null;
      const candidates = [configuredChannel, guild.systemChannel, ...guild.channels.cache.values()]
        .filter((channel, index, list) => channel && list.indexOf(channel) === index)
        .filter((channel) => channel.isTextBased() && typeof channel.send === 'function')
        .filter((channel) => channel.permissionsFor(botMember)?.has([
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
        ]));

      const embed = new EmbedBuilder()
        .setColor(status.color)
        .setTitle(status.title)
        .setDescription(status.description)
        .setTimestamp();
      let delivered = false;
      for (const channel of candidates) {
        try {
          await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
          results.push({ guildId: guild.id, channelId: channel.id });
          delivered = true;
          break;
        } catch (error) {
          if (![50001, 50013, 10003].includes(Number(error.code))) throw error;
          console.warn(`[moderation-bot] Impossible d’envoyer l’état du bot dans #${channel.name} (${error.code}).`);
        }
      }
      if (!delivered) {
        console.warn(`[moderation-bot] Aucun salon accessible pour annoncer l’état du bot sur ${guild.name}.`);
        results.push({ guildId: guild.id, channelId: null });
      }
    } catch (error) {
      console.error(`[moderation-bot] Annonce d’état impossible sur ${guild.name} :`, error);
      results.push({ guildId: guild.id, channelId: null, error });
    }
  }
  return results;
}

export async function handleMemberEvent(member, event) {
  const settings = await getGuild(member.guild.id);
  const eventSettings = settings[event];
  if (!eventSettings.enabled || !eventSettings.channelId) return;

  const channel = await member.guild.channels.fetch(eventSettings.channelId);
  if (!channel?.isTextBased() || !channel.send) {
    throw new Error(`Le salon configuré pour les annonces de ${eventLabels[event].toLowerCase()} n’est plus disponible.`);
  }

  let content = eventSettings.message
    .replaceAll('{user}', `<@${member.id}>`)
    .replaceAll('{username}', member.user.username)
    .replaceAll('{server}', member.guild.name)
    .replaceAll('{memberCount}', String(member.guild.memberCount));
  if (event === 'welcome' && eventSettings.ping && !content.includes(`<@${member.id}>`)) {
    content = `<@${member.id}> ${content}`;
  }
  const embed = new EmbedBuilder()
    .setColor(event === 'welcome' ? 0x57f287 : 0x99aab5)
    .setTitle(event === 'welcome' ? 'Bienvenue sur le serveur' : 'Départ du serveur')
    .setDescription(content.slice(0, 4000))
    .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
    .setFooter({ text: `${member.guild.name} • ${member.guild.memberCount} membre(s)` })
    .setTimestamp();
  const options = {
    embeds: [embed],
    allowedMentions: { users: event === 'welcome' && eventSettings.ping ? [member.id] : [] },
  };
  if (eventSettings.imagePath) {
    const name = `${event}-image${eventSettings.imagePath.slice(eventSettings.imagePath.lastIndexOf('.'))}`;
    options.files = [new AttachmentBuilder(eventSettings.imagePath, { name })];
    embed.setImage(`attachment://${name}`);
  }
  await channel.send(options);
}
