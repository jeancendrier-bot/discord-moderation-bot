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
    content: `Merci d’avoir ajouté **${guild.client.user.username}** à **${guild.name}** !\n\nPour commencer : consultez \`/aide\`, réglez le serveur avec \`/config panneau\` puis publiez le panneau de tickets avec \`/ticket panel\`.`,
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
    .setDescription(content.slice(0, 4000))
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
