import { AttachmentBuilder, EmbedBuilder } from 'discord.js';
import { getGuild } from './store.js';

const eventLabels = {
  welcome: 'Bienvenue',
  leave: 'Départ',
};

export async function handleMemberEvent(member, event) {
  const settings = await getGuild(member.guild.id);
  const eventSettings = settings[event];
  if (!eventSettings.enabled || !eventSettings.channelId) return;

  const channel = await member.guild.channels.fetch(eventSettings.channelId);
  if (!channel?.isTextBased() || !channel.send) {
    throw new Error(`Le salon configuré pour les annonces de ${eventLabels[event].toLowerCase()} n’est plus disponible.`);
  }

  const content = eventSettings.message
    .replaceAll('{user}', `<@${member.id}>`)
    .replaceAll('{username}', member.user.username)
    .replaceAll('{server}', member.guild.name)
    .replaceAll('{memberCount}', String(member.guild.memberCount));
  const embed = new EmbedBuilder()
    .setColor(event === 'welcome' ? 0x57f287 : 0x99aab5)
    .setDescription(content.slice(0, 4000))
    .setTimestamp();
  const options = {
    embeds: [embed],
    allowedMentions: { users: [member.id] },
  };
  if (eventSettings.imagePath) {
    const name = `${event}-image${eventSettings.imagePath.slice(eventSettings.imagePath.lastIndexOf('.'))}`;
    options.files = [new AttachmentBuilder(eventSettings.imagePath, { name })];
    embed.setImage(`attachment://${name}`);
  }
  await channel.send(options);
}
