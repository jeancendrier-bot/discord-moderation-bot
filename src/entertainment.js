import { randomInt, randomUUID } from 'node:crypto';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import { getGuild, save } from './store.js';

const maximumDurationMinutes = 7 * 24 * 60;
const maximumWinners = 20;
const giveawayTimers = new Map();
const endingGiveaways = new Set();

function giveawayKey(guildId, giveawayId) {
  return `${guildId}:${giveawayId}`;
}

function giveawayEmbed(giveaway) {
  const embed = new EmbedBuilder()
    .setColor(giveaway.ended ? 0x99aab5 : 0xf1c40f)
    .setTitle(giveaway.ended ? 'Giveaway terminé' : '🎉 Giveaway')
    .setDescription(`**Lot :** ${giveaway.prize}`)
    .addFields(
      { name: 'Gagnants', value: String(giveaway.winnerCount), inline: true },
      { name: 'Participants', value: String(giveaway.entrants.length), inline: true },
      { name: 'Fin', value: `<t:${Math.floor(giveaway.endsAt / 1000)}:R>`, inline: true },
    )
    .setTimestamp(giveaway.endedAt ?? giveaway.endsAt);
  if (giveaway.ended) {
    embed.addFields({
      name: 'Résultat',
      value: giveaway.winners.length
        ? giveaway.winners.map((userId) => `<@${userId}>`).join(', ')
        : 'Aucun participant : aucun gagnant n’a été tiré au sort.',
    });
  }
  return embed;
}

function giveawayComponents(giveaway) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`giveaway:join:${giveaway.id}`)
      .setLabel(`Participer (${giveaway.entrants.length})`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(giveaway.ended),
  )];
}

function drawWinners(entrants, winnerCount) {
  const pool = [...entrants];
  const winners = [];
  while (pool.length > 0 && winners.length < winnerCount) {
    winners.push(pool.splice(randomInt(pool.length), 1)[0]);
  }
  return winners;
}

async function finishGiveaway(client, guildId, giveawayId) {
  const key = giveawayKey(guildId, giveawayId);
  if (endingGiveaways.has(key)) return;
  endingGiveaways.add(key);
  giveawayTimers.delete(key);
  try {
    const settings = await getGuild(guildId);
    const giveaway = settings.giveaways.find((entry) => entry.id === giveawayId);
    if (!giveaway || giveaway.ended) return;

    giveaway.ended = true;
    giveaway.endedAt = Date.now();
    giveaway.winners = drawWinners(giveaway.entrants, giveaway.winnerCount);
    await save();

    const channel = await client.channels.fetch(giveaway.channelId);
    const message = await channel.messages.fetch(giveaway.messageId);
    await message.edit({
      embeds: [giveawayEmbed(giveaway)],
      components: giveawayComponents(giveaway),
      allowedMentions: { users: giveaway.winners },
    });
  } finally {
    endingGiveaways.delete(key);
  }
}

function scheduleGiveaway(client, guildId, giveaway) {
  const key = giveawayKey(guildId, giveaway.id);
  if (giveaway.ended || giveawayTimers.has(key)) return;
  const delay = Math.max(0, giveaway.endsAt - Date.now());
  const timer = setTimeout(() => {
    finishGiveaway(client, guildId, giveaway.id).catch((error) => {
      console.error(`[moderation-bot] Impossible de terminer le giveaway ${giveaway.id} :`, error);
    });
  }, delay);
  timer.unref?.();
  giveawayTimers.set(key, timer);
}

export async function restoreGiveaways(client) {
  for (const guild of client.guilds.cache.values()) {
    const settings = await getGuild(guild.id);
    for (const giveaway of settings.giveaways) {
      scheduleGiveaway(client, guild.id, giveaway);
    }
  }
}

export async function startGiveaway(interaction) {
  const prize = interaction.options.getString('lot', true).trim();
  const durationMinutes = interaction.options.getInteger('duree', true);
  const winnerCount = interaction.options.getInteger('gagnants', true);
  if (!prize || prize.length > 150
    || !Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > maximumDurationMinutes
    || !Number.isInteger(winnerCount) || winnerCount < 1 || winnerCount > maximumWinners) {
    await interaction.reply({
      content: 'Paramètres invalides : lot de 1 à 150 caractères, durée de 1 à 10 080 minutes et de 1 à 20 gagnants.',
      ephemeral: true,
    });
    return;
  }

  const channel = interaction.options.getChannel('salon') ?? interaction.channel;
  if (!channel || typeof channel.send !== 'function') {
    await interaction.reply({
      content: 'Choisissez un salon textuel où le bot peut publier le giveaway, ou lancez la commande depuis un salon textuel.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const settings = await getGuild(interaction.guildId);
  const activeGiveaways = settings.giveaways.filter((giveaway) => !giveaway.ended);
  if (activeGiveaways.length >= 50) {
    await interaction.editReply({ content: 'Ce serveur a déjà 50 giveaways en cours. Terminez-en un avant d’en créer un autre.' });
    return;
  }

  const giveaway = {
    id: randomUUID(),
    prize,
    winnerCount,
    endsAt: Date.now() + durationMinutes * 60_000,
    entrants: [],
    winners: [],
    ended: false,
    channelId: channel.id,
    messageId: null,
    startedBy: interaction.user.id,
  };
  const message = await channel.send({
    embeds: [giveawayEmbed(giveaway)],
    components: giveawayComponents(giveaway),
    allowedMentions: { parse: [] },
  });
  giveaway.messageId = message.id;
  settings.giveaways.push(giveaway);
  try {
    await save();
  } catch (error) {
    settings.giveaways.splice(settings.giveaways.indexOf(giveaway), 1);
    await message.delete().catch((cleanupError) => {
      console.error('[moderation-bot] Impossible de supprimer le giveaway non enregistré :', cleanupError);
    });
    throw error;
  }
  scheduleGiveaway(interaction.client, interaction.guildId, giveaway);
  await interaction.editReply({ content: `Le giveaway pour **${prize}** est publié dans <#${channel.id}>.` });
}

export async function startMiniGame(interaction) {
  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('✊ Pierre-feuille-ciseaux')
      .setDescription('Choisis ton coup :')],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('minijeu:rps:pierre').setLabel('✊ Pierre').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('minijeu:rps:feuille').setLabel('✋ Feuille').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('minijeu:rps:ciseaux').setLabel('✌️ Ciseaux').setStyle(ButtonStyle.Secondary),
    )],
    ephemeral: true,
  });
}

export async function handleEntertainmentInteraction(interaction) {
  const isGiveawayButton = interaction.isButton() && interaction.customId.startsWith('giveaway:join:');
  const isGameButton = interaction.isButton() && interaction.customId.startsWith('minijeu:rps:');
  if (!isGiveawayButton && !isGameButton) return false;
  if (!interaction.inGuild()) {
    await interaction.reply({ content: 'Cette interaction est disponible uniquement sur un serveur Discord.', ephemeral: true });
    return true;
  }

  if (isGiveawayButton) {
    const giveawayId = interaction.customId.slice('giveaway:join:'.length);
    const settings = await getGuild(interaction.guildId);
    const giveaway = settings.giveaways.find((entry) =>
      entry.id === giveawayId && entry.messageId === interaction.message.id && entry.channelId === interaction.channelId,
    );
    if (!giveaway || giveaway.ended || giveaway.endsAt <= Date.now()) {
      if (giveaway && !giveaway.ended) {
        await finishGiveaway(interaction.client, interaction.guildId, giveaway.id);
      }
      await interaction.reply({ content: 'Ce giveaway est terminé ou n’est plus disponible.', ephemeral: true });
      return true;
    }
    if (interaction.user.bot) {
      await interaction.reply({ content: 'Les comptes automatisés ne peuvent pas participer.', ephemeral: true });
      return true;
    }
    if (giveaway.entrants.includes(interaction.user.id)) {
      await interaction.reply({ content: 'Tu participes déjà à ce giveaway !', ephemeral: true });
      return true;
    }

    giveaway.entrants.push(interaction.user.id);
    try {
      await save();
      await interaction.message.edit({
        embeds: [giveawayEmbed(giveaway)],
        components: giveawayComponents(giveaway),
      });
    } catch (error) {
      giveaway.entrants.splice(giveaway.entrants.indexOf(interaction.user.id), 1);
      await save();
      throw error;
    }
    await interaction.reply({ content: 'Ta participation est enregistrée. Bonne chance !', ephemeral: true });
    return true;
  }

  const choices = ['pierre', 'feuille', 'ciseaux'];
  const playerChoice = interaction.customId.slice('minijeu:rps:'.length);
  if (!choices.includes(playerChoice)) {
    await interaction.reply({ content: 'Ce choix de jeu n’est pas reconnu.', ephemeral: true });
    return true;
  }
  const botChoice = choices[randomInt(choices.length)];
  const labels = { pierre: '✊ Pierre', feuille: '✋ Feuille', ciseaux: '✌️ Ciseaux' };
  const result = playerChoice === botChoice
    ? 'Égalité !'
    : (
      (playerChoice === 'pierre' && botChoice === 'ciseaux')
      || (playerChoice === 'feuille' && botChoice === 'pierre')
      || (playerChoice === 'ciseaux' && botChoice === 'feuille')
        ? 'Tu as gagné !'
        : 'Le bot a gagné !'
    );
  await interaction.reply({
    content: `Tu as choisi ${labels[playerChoice]} ; le bot a choisi ${labels[botChoice]}. **${result}**`,
    ephemeral: true,
  });
  return true;
}
