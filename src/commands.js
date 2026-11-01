import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ChannelSelectMenuBuilder,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  RoleSelectMenuBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { getGuild, removeMemberEventImage, save, saveMemberEventImage } from './store.js';
import { connectConfiguredVoice, disconnectConfiguredVoice } from './voice.js';
import { startGiveaway, startMiniGame } from './entertainment.js';

const reason = (o) => o.setName('reason').setDescription('Motif communiqué au membre et consigné dans le journal').setMaxLength(400);
const user = (o) => o.setName('user').setDescription('Membre visé par cette action').setRequired(true);
export const commands = [
  new SlashCommandBuilder().setName('aide').setDescription('Consulter les commandes disponibles et les permissions requises'),
  new SlashCommandBuilder().setName('warn').setDescription('Consigner un avertissement officiel à l’intention d’un membre').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(user).addStringOption((o) => reason(o).setRequired(true)),
  new SlashCommandBuilder().setName('warnings').setDescription('Consulter les avertissements consignés pour un membre').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addUserOption(user),
  new SlashCommandBuilder().setName('unwarn').setDescription('Retirer un avertissement précis du dossier d’un membre').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(user).addIntegerOption((o) => o.setName('number').setDescription('Numéro de l’avertissement affiché dans /warnings').setMinValue(1).setRequired(true)),
  new SlashCommandBuilder().setName('clearwarnings').setDescription('Supprimer les avertissements consignés pour un membre').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addUserOption(user),
  new SlashCommandBuilder().setName('timeout').setDescription('Suspendre temporairement un membre de la conversation').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(user).addIntegerOption((o) => o.setName('minutes').setDescription('Durée de la suspension, de 1 minute à 28 jours').setMinValue(1).setMaxValue(40320).setRequired(true)).addStringOption(reason),
  new SlashCommandBuilder().setName('untimeout').setDescription('Mettre fin à la suspension temporaire d’un membre').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addUserOption(user),
  new SlashCommandBuilder().setName('kick').setDescription('Exclure un membre du serveur').setDefaultMemberPermissions(PermissionFlagsBits.KickMembers).addUserOption(user).addStringOption(reason),
  new SlashCommandBuilder().setName('ban').setDescription('Bannir un membre du serveur').setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(user).addStringOption(reason).addIntegerOption((o) => o.setName('delete_days').setDescription('Nombre de jours de messages à supprimer (0 à 7)').setMinValue(0).setMaxValue(7)),
  new SlashCommandBuilder().setName('unban').setDescription('Lever un bannissement ou consulter la liste des comptes bannis').setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addSubcommand((o) => o.setName('retirer').setDescription('Lever le bannissement associé à un identifiant Discord')
      .addStringOption((option) => option.setName('user_id').setDescription('Identifiant Discord du compte concerné').setRequired(true))
      .addStringOption(reason))
    .addSubcommand((o) => o.setName('liste').setDescription('Consulter les comptes bannis du serveur')
      .addIntegerOption((option) => option.setName('page').setDescription('Page à afficher (20 comptes par page)').setMinValue(1).setMaxValue(50))),
  new SlashCommandBuilder().setName('purge').setDescription('Supprimer des messages récents dans le salon actuel').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((o) => o.setName('amount').setDescription('Nombre maximal de messages à supprimer (1 à 100)').setMinValue(1).setMaxValue(100).setRequired(true))
    .addUserOption((o) => o.setName('from').setDescription('Limiter la suppression aux messages de ce membre')),
  new SlashCommandBuilder().setName('slowmode').setDescription('Définir le délai minimal entre deux messages dans le salon').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addIntegerOption((o) => o.setName('seconds').setDescription('Délai en secondes (0 à 21 600 ; 0 désactive le mode lent)').setMinValue(0).setMaxValue(21600).setRequired(true)),
  new SlashCommandBuilder().setName('lock').setDescription('Interdire temporairement aux membres d’écrire dans ce salon').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder().setName('unlock').setDescription('Rétablir le droit d’écrire dans ce salon').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder().setName('dire').setDescription('Publier un message au nom du bot dans un salon').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((o) => o.setName('message').setDescription('Texte à publier (les mentions ne déclencheront pas de notification)').setMaxLength(1900).setRequired(true))
    .addChannelOption((o) => o.setName('salon').setDescription('Salon de destination ; par défaut, le salon actuel').addChannelTypes(ChannelType.GuildText)),
  new SlashCommandBuilder().setName('nickname').setDescription('Définir ou réinitialiser le pseudonyme d’un membre').setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
    .addUserOption(user).addStringOption((o) => o.setName('nickname').setDescription('Nouveau pseudonyme ; laisser vide pour rétablir celui d’origine').setMaxLength(32)).addStringOption(reason),
  new SlashCommandBuilder().setName('report').setDescription('Signaler un membre à l’équipe de modération')
    .addUserOption((o) => o.setName('user').setDescription('Membre à signaler').setRequired(true))
    .addStringOption((o) => o.setName('details').setDescription('Décrivez clairement le problème').setMaxLength(800).setRequired(true)),
  new SlashCommandBuilder().setName('vocal').setDescription('Gérer la connexion vocale persistante du bot').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((o) => o.setName('rejoindre').setDescription('Rejoindre et mémoriser le salon vocal')
      .addChannelOption((option) => option.setName('salon').setDescription('Salon vocal à rejoindre').addChannelTypes(ChannelType.GuildVoice).setRequired(true)))
    .addSubcommand((o) => o.setName('quitter').setDescription('Quitter le salon et désactiver la reconnexion')),
  new SlashCommandBuilder().setName('logs').setDescription('Consulter les dernières entrées du journal de modération').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((o) => o.setName('afficher').setDescription('Consulter les dix dernières entrées du journal')),
  new SlashCommandBuilder().setName('securitas').setDescription('Ouvrir les panneaux de configuration du serveur').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((o) => o.setName('annonce').setDescription('Ouvrir le panneau de bienvenue ou de départ')
      .addChoices({ name: 'Bienvenue', value: 'welcome' }, { name: 'Départ', value: 'leave' }))
    .addAttachmentOption((o) => o.setName('image').setDescription('Joindre une image PNG, JPEG, GIF ou WebP (8 Mo max)'))
    .addBooleanOption((o) => o.setName('effacer_image').setDescription('Supprimer l’image personnalisée de l’annonce choisie')),
  new SlashCommandBuilder().setName('giveaway').setDescription('Créer un giveaway avec participation par bouton dans un salon textuel').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((o) => o.setName('lot').setDescription('Lot à gagner').setMaxLength(150).setRequired(true))
    .addIntegerOption((o) => o.setName('duree').setDescription('Durée en minutes (1 à 10 080)').setMinValue(1).setMaxValue(10080).setRequired(true))
    .addIntegerOption((o) => o.setName('gagnants').setDescription('Nombre de gagnants (1 à 20)').setMinValue(1).setMaxValue(20).setRequired(true))
    .addChannelOption((o) => o.setName('salon').setDescription('Salon textuel de destination ; par défaut, le salon actuel').addChannelTypes(ChannelType.GuildText)),
  new SlashCommandBuilder().setName('minijeu').setDescription('Jouer à pierre-feuille-ciseaux contre le bot'),
  new SlashCommandBuilder().setName('tickets').setDescription('Ouvrir le tableau interactif de gestion des tickets').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
].map((c) => c.toJSON());

const COLORS = { warn: 0xfee75c, timeout: 0xe67e22, untimeout: 0x57f287, kick: 0xed4245, ban: 0x992d22, unban: 0x57f287, purge: 0x5865f2, clearwarnings: 0x57f287, lock: 0xed4245, unlock: 0x57f287, nickname: 0x5865f2 };
const ACTION_LABELS = { warn: 'Avertissement', unwarn: 'Retrait d’un avertissement', timeout: 'Suspension temporaire', untimeout: 'Levée de suspension', kick: 'Exclusion du serveur', ban: 'Bannissement', unban: 'Levée de bannissement', purge: 'Suppression de messages', clearwarnings: 'Suppression des avertissements', lock: 'Verrouillage du salon', unlock: 'Déverrouillage du salon', nickname: 'Modification du pseudonyme' };
const REQUIRED_COMMAND_PERMISSIONS = {
  warn: PermissionFlagsBits.ModerateMembers,
  warnings: PermissionFlagsBits.ModerateMembers,
  unwarn: PermissionFlagsBits.ModerateMembers,
  clearwarnings: PermissionFlagsBits.ModerateMembers,
  timeout: PermissionFlagsBits.ModerateMembers,
  untimeout: PermissionFlagsBits.ModerateMembers,
  kick: PermissionFlagsBits.KickMembers,
  ban: PermissionFlagsBits.BanMembers,
  unban: PermissionFlagsBits.BanMembers,
  purge: PermissionFlagsBits.ManageMessages,
  slowmode: PermissionFlagsBits.ManageChannels,
  lock: PermissionFlagsBits.ManageChannels,
  unlock: PermissionFlagsBits.ManageChannels,
  dire: PermissionFlagsBits.ManageMessages,
  nickname: PermissionFlagsBits.ManageNicknames,
  vocal: PermissionFlagsBits.ManageGuild,
  logs: PermissionFlagsBits.ManageGuild,
  securitas: PermissionFlagsBits.ManageGuild,
  giveaway: PermissionFlagsBits.ManageGuild,
  tickets: PermissionFlagsBits.ManageGuild,
};

const HELP_GROUPS = [
  {
    name: 'Modération des membres',
    value: 'members',
    description: 'Avertissements, suspensions, exclusions, bannissements et signalements.',
    permission: 'La permission requise est indiquée par Discord pour chaque commande.',
    commands: ['warn', 'warnings', 'unwarn', 'clearwarnings', 'timeout', 'untimeout', 'kick', 'ban', 'unban', 'nickname', 'report'],
  },
  {
    name: 'Salons et journal',
    value: 'channels',
    description: 'Nettoyage, contrôle des salons, annonces et historique de modération.',
    permission: 'Gérer les messages, les salons ou le serveur selon la commande.',
    commands: ['purge', 'slowmode', 'lock', 'unlock', 'dire', 'logs', 'vocal'],
  },
  {
    name: 'Configuration et tickets',
    value: 'configuration',
    description: 'Panneaux de sécurité, annonces, CAPTCHA et système de tickets.',
    permission: 'Gérer le serveur pour configurer ; les tickets dépendent de leur configuration.',
    commands: ['securitas', 'tickets'],
  },
  {
    name: 'Jeux et animations',
    value: 'entertainment',
    description: 'Giveaways avec participation par bouton et mini-jeu privé.',
    permission: 'Le giveaway nécessite Gérer le serveur ; le mini-jeu est ouvert à tous.',
    commands: ['giveaway', 'minijeu'],
  },
];

function helpPanelEmbed(groupValue = 'home') {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setFooter({ text: 'Commandes slash • Les permissions dépendent de l’action' });
  if (groupValue === 'home') {
    return embed
      .setTitle('📚 Commandes du bot')
      .setDescription('Choisissez une catégorie pour voir les commandes correspondantes. Les actions habituelles restent accessibles directement avec `/commande`.')
      .addFields(HELP_GROUPS.map((group) => ({
        name: group.name,
        value: `${group.description}\n${group.commands.map((commandName) => `/${commandName}`).join(' · ')}`,
      })));
  }
  const group = HELP_GROUPS.find((item) => item.value === groupValue);
  if (!group) return null;
  return embed
    .setTitle(`📚 ${group.name}`)
    .setDescription(group.commands.map((commandName) => {
      const command = commands.find((entry) => entry.name === commandName);
      return `**/${commandName}** — ${command.description}`;
    }).join('\n'))
    .addFields({ name: 'Permissions', value: group.permission });
}

function helpPanelComponents() {
  return [new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('help:category')
      .setPlaceholder('Afficher les commandes par catégorie')
      .addOptions(
        { label: 'Toutes les catégories', value: 'home' },
        ...HELP_GROUPS.map(({ name, value }) => ({ label: name, value })),
      ),
  )];
}

async function log(interaction, settings, action, target, details) {
  if (!settings.logChannelId) return;
  const channel = interaction.guild.channels.cache.get(settings.logChannelId);
  if (!channel) return;
  const embed = new EmbedBuilder()
    .setTitle(ACTION_LABELS[action] ?? action)
    .setColor(COLORS[action] ?? 0x99aab5)
    .addFields(
      { name: 'Membre concerné', value: target ? `<@${target.id}> (${target.tag ?? target.id})` : 'Aucun', inline: true },
      { name: 'Action effectuée par', value: `<@${interaction.user.id}>`, inline: true },
      ...(details ? [{ name: 'Motif et précisions', value: details.slice(0, 1000) }] : []),
    )
    .setTimestamp();
  await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch((err) => console.error('[moderation-bot] Échec de publication dans le journal :', err.message));
}

async function tell(target, guild, text) {
  await target.send({ content: `**${guild.name}:** ${text}`, allowedMentions: { parse: [] } }).catch(() => {});
}

/** The bot can only act below its own top role, and a moderator only below theirs. */
function canActOn(interaction, member, moderator) {
  if (!member) return { ok: true };
  if (member.id === interaction.guild.ownerId) return { ok: false, why: 'Cette action ne peut pas être appliquée au propriétaire du serveur.' };
  const me = interaction.guild.members.me;
  if (me && member.roles.highest.position >= me.roles.highest.position) return { ok: false, why: 'Le rôle le plus élevé de ce membre doit être inférieur à celui du bot.' };
  if (!moderator) return { ok: false, why: 'Votre rôle sur le serveur n’a pas pu être vérifié. Réessayez ou contactez un administrateur.' };
  if (member.roles.highest.position >= moderator.roles.highest.position && interaction.user.id !== interaction.guild.ownerId) {
    return { ok: false, why: 'Le rôle le plus élevé de ce membre doit être inférieur au vôtre.' };
  }
  return { ok: true };
}

function ticketOwner(channel) {
  return channel?.topic?.match(/^ticket-owner:(\d+)$/)?.[1] ?? null;
}

const ticketCreations = new Set();

async function fetchTicketCategory(guild, categoryId) {
  if (!categoryId) return null;
  try {
    const category = await guild.channels.fetch(categoryId);
    return category?.type === ChannelType.GuildCategory ? category : null;
  } catch (error) {
    if (Number(error.code) === 10003) return null;
    throw error;
  }
}

function ticketPanelComponents() {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket:open')
      .setLabel('Ouvrir un ticket')
      .setStyle(ButtonStyle.Primary),
  )];
}

function ticketPanelEmbed(settings) {
  return new EmbedBuilder()
    .setTitle(settings.ticketPanelTitle)
    .setDescription(settings.ticketPanelDescription)
    .setColor(0x5865f2)
    .setFooter({ text: 'Assistance privée • Votre demande sera visible par vous et l’équipe de support' });
}

function announcementPreview(settings, guild, event) {
  const config = settings[event];
  const description = config.message
    .replaceAll('{user}', 'Nouveau membre')
    .replaceAll('{username}', 'Nouveau membre')
    .replaceAll('{server}', guild.name)
    .replaceAll('{memberCount}', String(guild.memberCount ?? '—'));
  const embed = new EmbedBuilder()
    .setColor(event === 'welcome' ? 0x57f287 : 0x99aab5)
    .setTitle(event === 'welcome' ? 'Bienvenue sur le serveur' : 'Départ du serveur')
    .setDescription(description.slice(0, 4000))
    .setFooter({ text: `Aperçu • ${guild.name}` })
    .setTimestamp();
  const options = { embeds: [embed], allowedMentions: { parse: [] } };
  if (config.imagePath) {
    const name = `${event}-preview${config.imagePath.slice(config.imagePath.lastIndexOf('.'))}`;
    options.files = [new AttachmentBuilder(config.imagePath, { name })];
    embed.setImage(`attachment://${name}`);
  }
  return options;
}

function ticketCloseComponents(disabled = false) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket:close')
      .setLabel('Clôturer le ticket')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
  )];
}

const configStatus = (enabled) => enabled ? '🟢 Activé' : '⚫ Désactivé';
const configuredChannel = (id) => id ? `<#${id}>` : '*Non configuré*';
const configuredRole = (id) => id ? `<@&${id}>` : '*Aucun rôle*';

function warBoubouEmbed(settings) {
  const { antiRaid, antiSpam, antiLink } = settings.security;
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Securitas')
    .setDescription('Tableau unique des protections automatiques du serveur. Les changements sont enregistrés immédiatement.')
    .addFields(
      {
        name: '🚨 Anti-raid',
        value: `${configStatus(antiRaid.enabled)} • ${antiRaid.joinThreshold} arrivées en ${antiRaid.intervalSeconds} s • protection ${antiRaid.protectionMinutes} min`,
      },
      {
        name: '💬 Anti-spam',
        value: `${configStatus(antiSpam.enabled)} • ${antiSpam.maxMessages} messages en ${antiSpam.intervalSeconds} s • suspension ${antiSpam.timeoutMinutes} min`,
      },
      {
        name: '🔗 Anti-liens',
        value: `${configStatus(antiLink.enabled)} • ${antiLink.mode === 'all' ? 'Tous les liens' : 'Invitations Discord'} • rôle exempté : ${configuredRole(antiLink.exemptRoleId)}`,
      },
    )
    .setFooter({ text: 'Réglages réservés aux membres ayant Gérer le serveur' })
    .setTimestamp();
}

function warBoubouComponents(settings) {
  const { antiRaid, antiSpam, antiLink } = settings.security;
  return [
    new ActionRowBuilder().addComponents(
      configButton('warboubou:set:antiRaid:toggle', antiRaid.enabled ? 'Désactiver anti-raid' : 'Activer anti-raid', antiRaid.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      configButton('warboubou:edit:antiRaid', 'Seuils anti-raid', ButtonStyle.Primary),
      configButton('warboubou:set:antiSpam:toggle', antiSpam.enabled ? 'Désactiver anti-spam' : 'Activer anti-spam', antiSpam.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      configButton('warboubou:edit:antiSpam', 'Seuils anti-spam', ButtonStyle.Primary),
    ),
    new ActionRowBuilder().addComponents(
      configButton('warboubou:set:antiLink:toggle', antiLink.enabled ? 'Désactiver anti-liens' : 'Activer anti-liens', antiLink.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      configButton('warboubou:clear:antiLinkRole', 'Retirer le rôle exempté', ButtonStyle.Danger),
    ),
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('warboubou:select:antiLinkMode').setPlaceholder('Choisir les liens à bloquer')
        .addOptions([
          { label: 'Invitations Discord uniquement', value: 'invites', default: antiLink.mode === 'invites' },
          { label: 'Tous les liens', value: 'all', default: antiLink.mode === 'all' },
        ]),
    ),
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder().setCustomId('warboubou:role:antiLink').setPlaceholder('Choisir le rôle exempté').setMinValues(1).setMaxValues(1),
    ),
  ];
}

const SECURITAS_PANEL_OPTIONS = [
  { label: 'Securitas — protections', value: 'security' },
  { label: 'Tickets', value: 'tickets' },
  { label: 'Vérification CAPTCHA', value: 'verification' },
  { label: 'Journal de modération', value: 'logs' },
  { label: 'Bienvenue', value: 'welcome' },
  { label: 'Départ', value: 'leave' },
  { label: 'Langue', value: 'language' },
];

function securitasDashboardEmbed() {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🛡️ Securitas — configuration du serveur')
    .setDescription('Choisissez un panneau dans le menu. Les modifications sont enregistrées immédiatement.')
    .addFields(
      { name: '🛡️ Sécurité', value: 'Protections Securitas et vérification CAPTCHA', inline: true },
      { name: '🎫 Communauté', value: 'Tickets, bienvenue et départ', inline: true },
      { name: '📋 Gestion', value: 'Journal de modération et langue des notifications', inline: true },
    )
    .setFooter({ text: 'Panneau privé • Réservé aux membres ayant Gérer le serveur' });
}

function securitasDashboardSelect() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('securitas:dashboard')
      .setPlaceholder('Ouvrir un panneau de configuration')
      .addOptions({ label: 'Accueil — tous les panneaux', value: 'home' }, ...SECURITAS_PANEL_OPTIONS),
  );
}

function configEmbed(settings, key) {
  const { security } = settings;
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setFooter({ text: 'Réglage privé • Les changements sont enregistrés immédiatement' })
    .setTimestamp();

  if (key === 'language') {
    embed.setTitle('🌐 Langue des notifications')
      .setDescription('Choisissez la langue utilisée par les notifications automatiques du bot.')
      .addFields({ name: 'Langue actuelle', value: `**${security.language === 'en' ? 'English' : 'Français'}**` });
  } else if (key === 'antiLink') {
    embed.setTitle('🔗 Filtre anti-liens')
      .setDescription('Contrôlez les liens autorisés, choisissez le mode et, si nécessaire, sélectionnez un rôle exempté.')
      .addFields(
        { name: 'Protection', value: configStatus(security.antiLink.enabled), inline: true },
        { name: 'Mode', value: security.antiLink.mode === 'all' ? '**Tous les liens**' : '**Invitations Discord**', inline: true },
        { name: 'Rôle exempté', value: configuredRole(security.antiLink.exemptRoleId), inline: true },
      );
  } else if (key === 'antiSpam') {
    embed.setTitle('💬 Protection anti-spam')
      .setDescription('Définissez quand les messages répétés déclenchent une intervention.')
      .addFields(
        { name: 'Protection', value: configStatus(security.antiSpam.enabled), inline: true },
        { name: 'Seuil', value: `**${security.antiSpam.maxMessages} messages** en **${security.antiSpam.intervalSeconds} s**`, inline: true },
        { name: 'Suspension', value: `**${security.antiSpam.timeoutMinutes} min**`, inline: true },
      );
  } else if (key === 'antiRaid') {
    embed.setTitle('🚨 Protection anti-raid')
      .setDescription('Définissez le seuil d’arrivée massive et la durée de la vérification renforcée.')
      .addFields(
        { name: 'Protection', value: configStatus(security.antiRaid.enabled), inline: true },
        { name: 'Seuil', value: `**${security.antiRaid.joinThreshold} arrivées** en **${security.antiRaid.intervalSeconds} s**`, inline: true },
        { name: 'Durée', value: `**${security.antiRaid.protectionMinutes} min**`, inline: true },
      );
  } else if (key === 'verification') {
    embed.setTitle('🔐 Vérification des nouveaux membres')
      .setDescription('Un membre doit réussir un CAPTCHA visuel privé pour recevoir le rôle vérifié. Configurez ce rôle et publiez le panneau dans un salon accessible aux nouveaux membres.')
      .addFields(
        { name: 'Protection', value: configStatus(security.verification.enabled), inline: true },
        { name: 'Rôle après validation', value: configuredRole(security.verification.roleId), inline: true },
        { name: 'Étape requise sur le serveur', value: 'Limitez l’accès aux salons aux membres portant le rôle vérifié. Laissez le salon du panneau visible pour @everyone.' },
      );
  } else if (key === 'logs') {
    embed.setTitle('📋 Journal de modération')
      .setDescription('Les sanctions et les actions de modération seront publiées dans le salon choisi.')
      .addFields({ name: 'Salon actuel', value: configuredChannel(settings.logChannelId) });
  } else if (key === 'welcome' || key === 'leave') {
    const announcement = settings[key];
    embed.setTitle(key === 'welcome' ? '👋 Annonce de bienvenue' : '🚪 Annonce de départ')
      .setDescription(key === 'welcome'
        ? 'Personnalisez le message envoyé lorsqu’un membre rejoint le serveur.'
        : 'Personnalisez le message envoyé lorsqu’un membre quitte le serveur.')
      .addFields(
        { name: 'État', value: configStatus(announcement.enabled), inline: true },
        { name: 'Salon', value: configuredChannel(announcement.channelId), inline: true },
        ...(key === 'welcome' ? [{ name: 'Mention', value: announcement.ping ? '🟢 Activée' : '⚫ Désactivée', inline: true }] : []),
        { name: 'Texte', value: `> ${announcement.message.replaceAll('\n', '\n> ').slice(0, 900)}` },
        { name: 'Image', value: announcement.imagePath ? '🟢 Image personnalisée enregistrée' : '⚫ Aucune image' },
        { name: 'Variables disponibles', value: '`{user}` · `{username}` · `{server}` · `{memberCount}`' },
      );
  } else if (key === 'tickets') {
    embed.setTitle('🎫 Configuration des tickets')
      .setDescription('Configurez l’emplacement des demandes, l’équipe responsable et le texte du panneau public.')
      .addFields(
        { name: 'Catégorie', value: configuredChannel(settings.ticketCategoryId), inline: true },
        { name: 'Équipe support', value: configuredRole(settings.ticketSupportRoleId), inline: true },
        { name: 'Titre du panneau', value: settings.ticketPanelTitle, inline: true },
        { name: 'Message du panneau', value: settings.ticketPanelDescription.slice(0, 900) },
        { name: 'Accès aux tickets', value: 'Chaque demande ouvre un salon privé pour le membre, le rôle support et le bot.' },
      );
  }
  return embed;
}

function configButton(customId, label, style = ButtonStyle.Secondary) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
}

function configChannelSelect(customId, placeholder, type = ChannelType.GuildText) {
  return new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder).setChannelTypes(type).setMinValues(1).setMaxValues(1),
  );
}

function configComponents(settings, key) {
  const rows = [];
  if (key === 'language') {
    rows.push(new ActionRowBuilder().addComponents(
      configButton('config:set:language:fr', 'Français', settings.security.language === 'fr' ? ButtonStyle.Success : ButtonStyle.Secondary),
      configButton('config:set:language:en', 'English', settings.security.language === 'en' ? ButtonStyle.Success : ButtonStyle.Secondary),
    ));
  } else if (key === 'antiLink') {
    rows.push(new ActionRowBuilder().addComponents(
      configButton('config:set:antiLink:toggle', settings.security.antiLink.enabled ? 'Désactiver le filtre' : 'Activer le filtre', settings.security.antiLink.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    ));
    rows.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('config:select:antiLinkMode').setPlaceholder('Choisir les liens à bloquer')
        .addOptions([
          { label: 'Invitations Discord uniquement', value: 'invites', default: settings.security.antiLink.mode === 'invites' },
          { label: 'Tous les liens', value: 'all', default: settings.security.antiLink.mode === 'all' },
        ]),
    ));
    rows.push(new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder().setCustomId('config:role:antiLink').setPlaceholder('Choisir le rôle exempté').setMinValues(1).setMaxValues(1),
    ));
    rows.push(new ActionRowBuilder().addComponents(configButton('config:clear:antiLinkRole', 'Retirer le rôle exempté', ButtonStyle.Danger)));
  } else if (key === 'antiSpam' || key === 'antiRaid') {
    const protection = settings.security[key];
    rows.push(new ActionRowBuilder().addComponents(
      configButton(`config:set:${key}:toggle`, protection.enabled ? 'Désactiver la protection' : 'Activer la protection', protection.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      configButton(`config:edit:${key}`, 'Modifier les seuils', ButtonStyle.Primary),
    ));
  } else if (key === 'verification') {
    rows.push(new ActionRowBuilder().addComponents(
      configButton('config:set:verification:toggle', settings.security.verification.enabled ? 'Désactiver la vérification' : 'Activer la vérification', settings.security.verification.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      configButton('config:publish:verification', 'Publier le panneau ici', ButtonStyle.Primary),
      configButton('config:clear:verificationRole', 'Retirer le rôle', ButtonStyle.Danger),
    ));
    rows.push(new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder().setCustomId('config:role:verification').setPlaceholder('Choisir le rôle accordé après validation').setMinValues(1).setMaxValues(1),
    ));
  } else if (key === 'logs') {
    rows.push(configChannelSelect('config:channel:logs', 'Sélectionner le salon du journal'));
    rows.push(new ActionRowBuilder().addComponents(configButton('config:clear:logs', 'Désactiver le journal', ButtonStyle.Danger)));
  } else if (key === 'welcome' || key === 'leave') {
    const announcement = settings[key];
    rows.push(configChannelSelect(`config:channel:${key}`, 'Sélectionner le salon de l’annonce'));
    rows.push(new ActionRowBuilder().addComponents(
      configButton(`config:set:${key}:toggle`, announcement.enabled ? 'Désactiver l’annonce' : 'Activer l’annonce', announcement.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      configButton(`config:edit:${key}`, 'Modifier le texte', ButtonStyle.Primary),
      ...(key === 'welcome'
        ? [configButton('config:set:welcomePing:toggle', announcement.ping ? 'Désactiver le ping' : 'Activer le ping')]
        : []),
      ...(announcement.imagePath
        ? [configButton(`config:clear:image:${key}`, 'Retirer l’image', ButtonStyle.Danger)]
        : []),
    ));
    rows.push(new ActionRowBuilder().addComponents(
      configButton(`config:preview:${key}`, 'Envoyer un aperçu dans le salon défini', ButtonStyle.Secondary),
    ));
  } else if (key === 'tickets') {
    rows.push(configChannelSelect('config:channel:ticketCategory', 'Sélectionner la catégorie', ChannelType.GuildCategory));
    rows.push(new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder().setCustomId('config:role:ticketSupport').setPlaceholder('Sélectionner le rôle support').setMinValues(1).setMaxValues(1),
    ));
    rows.push(new ActionRowBuilder().addComponents(
      configButton('config:clear:ticketCategory', 'Effacer la catégorie', ButtonStyle.Danger),
      configButton('config:clear:ticketRole', 'Effacer le rôle support', ButtonStyle.Danger),
    ));
    rows.push(new ActionRowBuilder().addComponents(
      configButton('config:edit:tickets', 'Modifier le panneau', ButtonStyle.Primary),
      configButton('config:preview:tickets', 'Aperçu ici', ButtonStyle.Secondary),
      configButton('config:publish:tickets', 'Publier ici', ButtonStyle.Success),
    ));
  }
  return rows;
}

function configPanelComponents(settings, key) {
  const rows = key === 'security' ? warBoubouComponents(settings) : configComponents(settings, key);
  return [...rows, securitasDashboardSelect()];
}

function configModal(customId, title, fields) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title);
  for (const field of fields) {
    const input = new TextInputBuilder()
      .setCustomId(field.id)
      .setLabel(field.label)
      .setStyle(field.long ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(field.required ?? true)
      .setMaxLength(field.maxLength ?? 40);
    if (field.placeholder) input.setPlaceholder(field.placeholder);
    if (field.value) input.setValue(String(field.value));
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  }
  return modal;
}

function configModalFor(settings, key, prefix = 'config') {
  const { security } = settings;
  if (key === 'tickets') {
    return configModal('config:save:tickets', 'Panneau de tickets', [
      { id: 'title', label: 'Titre (1–100 caractères)', value: settings.ticketPanelTitle, maxLength: 100 },
      { id: 'description', label: 'Instructions (1–1000 caractères)', value: settings.ticketPanelDescription, maxLength: 1000, long: true },
    ]);
  }
  if (key === 'antiSpam') {
    return configModal(`${prefix}:save:antiSpam`, 'Protection anti-spam', [
      { id: 'maximum', label: 'Messages avant intervention (3–15)', value: security.antiSpam.maxMessages, maxLength: 2 },
      { id: 'interval', label: 'Fenêtre en secondes (3–60)', value: security.antiSpam.intervalSeconds, maxLength: 2 },
      { id: 'timeout', label: 'Suspension en minutes (1–60)', value: security.antiSpam.timeoutMinutes, maxLength: 2 },
    ]);
  }
  return configModal(`${prefix}:save:antiRaid`, 'Protection anti-raid', [
    { id: 'threshold', label: 'Arrivées (3–30)', value: security.antiRaid.joinThreshold, maxLength: 2 },
    { id: 'interval', label: 'Fenêtre en secondes (5–120)', value: security.antiRaid.intervalSeconds, maxLength: 3 },
    { id: 'duration', label: 'Protection en minutes (1–60)', value: security.antiRaid.protectionMinutes, maxLength: 2 },
  ]);
}

function announcementModal(settings, section) {
  const announcement = settings[section];
  return configModal(`config:save:${section}`, section === 'welcome' ? 'Annonce de bienvenue' : 'Annonce de départ', [
    { id: 'message', label: 'Texte de l’annonce', value: announcement.message, maxLength: 1000, long: true },
  ]);
}

function modalValue(interaction, id) {
  return interaction.fields.getTextInputValue(id).trim();
}

function boundedInteger(value, minimum, maximum) {
  if (!/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= minimum && number <= maximum ? number : null;
}

async function createTicket(guild, user, client, settings, subject, details) {
  const creationKey = `${guild.id}:${user.id}`;
  if (ticketCreations.has(creationKey)) return { status: 'pending' };
  ticketCreations.add(creationKey);
  try {
    const existing = guild.channels.cache.find((channel) => ticketOwner(channel) === user.id);
    if (existing) return { status: 'existing', channel: existing };

    const category = await fetchTicketCategory(guild, settings.ticketCategoryId);
    if (!category || category.type !== ChannelType.GuildCategory) return { status: 'unconfigured' };

    const slug = user.username.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'member';
    const permissionOverwrites = [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
      { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] },
    ];
    if (settings.ticketSupportRoleId) {
      permissionOverwrites.push({
        id: settings.ticketSupportRoleId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      });
    }

    const channel = await guild.channels.create({
      name: `ticket-${slug}`,
      type: ChannelType.GuildText,
      parent: category.id,
      topic: `ticket-owner:${user.id}`,
      permissionOverwrites,
    });
    const embed = new EmbedBuilder()
      .setTitle(subject.slice(0, 256))
      .setDescription(details.slice(0, 4000) || 'Aucun détail supplémentaire fourni.')
      .setColor(0x5865f2)
      .addFields({ name: 'Demandeur', value: `<@${user.id}>` })
      .setTimestamp();
    try {
      await channel.send({
        content: `<@${user.id}> Votre demande a été transmise à l’équipe de support.`,
        embeds: [embed],
        components: ticketCloseComponents(),
        allowedMentions: { users: [user.id] },
      });
    } catch (error) {
      await channel.delete('Nettoyage : impossible de publier le message initial du ticket')
        .catch((cleanupError) => console.error('[moderation-bot] Impossible de supprimer un ticket créé sans message initial :', cleanupError.message));
      throw error;
    }
    return { status: 'created', channel };
  } finally {
    ticketCreations.delete(creationKey);
  }
}

async function closeTicket(channel, ownerId, supportRoleId) {
  const participants = channel.permissionOverwrites.cache.filter((overwrite) =>
    overwrite.id !== channel.guild.id
    && overwrite.id !== channel.client.user.id
    && overwrite.id !== supportRoleId,
  );
  await Promise.all(participants.map((overwrite) => overwrite.edit({ SendMessages: false })));
  await channel.setTopic(`ticket-closed:${ownerId}`);
  await channel.setName(`closed-${channel.name.replace(/^ticket-/, '').slice(0, 90)}`);
}

async function fetchMember(guild, userId) {
  try {
    return await guild.members.fetch(userId);
  } catch (error) {
    if (Number(error.code) === 10007) return null;
    throw error;
  }
}

async function canManageTicket(interaction, settings, ownerId) {
  if (interaction.user.id === ownerId || interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) return true;
  if (!settings.ticketSupportRoleId) return false;
  const member = await fetchMember(interaction.guild, interaction.user.id);
  return member?.roles.cache.has(settings.ticketSupportRoleId) ?? false;
}

export async function handleCommand(interaction) {
  const name = interaction.commandName;
  const requiredPermission = REQUIRED_COMMAND_PERMISSIONS[name];
  if (requiredPermission && !interaction.memberPermissions?.has(requiredPermission)) {
    await interaction.reply({ content: 'Vous ne disposez pas de la permission Discord requise pour utiliser cette commande.', ephemeral: true });
    return;
  }
  if (name === 'aide') {
    await interaction.reply({
      embeds: [helpPanelEmbed()],
      components: helpPanelComponents(),
      ephemeral: true,
    });
    return;
  }

  const settings = await getGuild(interaction.guildId);
  const getReason = () => interaction.options.getString('reason') || 'Aucun motif n’a été communiqué.';

  if (name === 'securitas') {
    const key = interaction.options.getString('annonce');
    const attachment = interaction.options.getAttachment('image');
    const clearImage = interaction.options.getBoolean('effacer_image') ?? false;
    if ((attachment || clearImage) && !key) {
      await interaction.reply({ content: 'Choisissez « Bienvenue » ou « Départ » dans l’option annonce pour modifier son image.', ephemeral: true });
      return;
    }
    if (attachment && clearImage) {
      await interaction.reply({ content: 'Joignez une nouvelle image ou choisissez de supprimer l’image actuelle, mais pas les deux.', ephemeral: true });
      return;
    }
    if (key && (attachment || clearImage)) {
      await interaction.deferReply({ ephemeral: true });
      const previousImage = settings[key].imagePath;
      const imagePath = attachment
        ? await saveMemberEventImage(interaction.guildId, key, attachment)
        : null;
      settings[key].imagePath = imagePath;
      await save();
      if (previousImage && previousImage !== imagePath) await removeMemberEventImage(previousImage);
      await interaction.editReply({
        embeds: [configEmbed(settings, key)],
        components: configPanelComponents(settings, key),
        allowedMentions: { parse: [] },
      });
      return;
    }
    await interaction.reply({
      embeds: [key ? configEmbed(settings, key) : securitasDashboardEmbed()],
      components: key ? configPanelComponents(settings, key) : [securitasDashboardSelect()],
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
    return;
  }
  if (name === 'tickets') {
    await interaction.reply({
      embeds: [configEmbed(settings, 'tickets')],
      components: configPanelComponents(settings, 'tickets'),
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
    return;
  }
  if (name === 'giveaway') {
    await startGiveaway(interaction);
    return;
  }
  if (name === 'minijeu') {
    await startMiniGame(interaction);
    return;
  }

  if (name === 'report') {
    const target = interaction.options.getUser('user', true);
    if (target.id === interaction.user.id) {
      await interaction.reply({ content: 'Vous ne pouvez pas vous signaler vous-même.', ephemeral: true });
      return;
    }
    if (!settings.logChannelId) {
      await interaction.reply({ content: 'Le salon des journaux n’est pas configuré. Prévenez un administrateur pour qu’il le choisisse dans `/securitas`.', ephemeral: true });
      return;
    }
    const member = await fetchMember(interaction.guild, target.id);
    if (!member) {
      await interaction.reply({ content: 'Le membre signalé ne fait pas partie de ce serveur.', ephemeral: true });
      return;
    }
    const details = interaction.options.getString('details', true).trim();
    if (!details) {
      await interaction.reply({ content: 'Ajoutez une description du problème avant d’envoyer le signalement.', ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    const channel = await interaction.guild.channels.fetch(settings.logChannelId);
    if (!channel?.isTextBased() || typeof channel.send !== 'function') {
      await interaction.editReply({ content: 'Le salon des journaux configuré n’est plus disponible. Prévenez un administrateur.' });
      return;
    }
    const embed = new EmbedBuilder()
      .setTitle('Nouveau signalement')
      .setColor(0xed4245)
      .addFields(
        { name: 'Membre signalé', value: `<@${target.id}> (${target.tag})`, inline: true },
        { name: 'Signalé par', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Description', value: details.slice(0, 1000) },
      )
      .setTimestamp();
    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
    await interaction.editReply({ content: 'Votre signalement a été transmis à l’équipe de modération.' });
    return;
  }

  if (name === 'vocal') {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: 'La permission « Gérer le serveur » est requise pour connecter le bot à un salon vocal.', ephemeral: true });
      return;
    }
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'quitter') {
      const disconnected = await disconnectConfiguredVoice(interaction.guildId);
      await interaction.reply({
        content: disconnected
          ? 'Le bot a quitté le salon vocal. Il ne s’y reconnectera pas tant que vous n’aurez pas relancé `/vocal rejoindre`.'
          : 'Le bot n’était connecté à aucun salon vocal et aucune reconnexion n’était programmée.',
        ephemeral: true,
      });
      return;
    }

    const channel = interaction.options.getChannel('salon', true);
    if (channel.type !== ChannelType.GuildVoice) {
      await interaction.reply({ content: 'Choisissez un salon vocal standard (les salons de scène ne sont pas pris en charge).', ephemeral: true });
      return;
    }
    const botMember = interaction.guild.members.me;
    if (!botMember || !channel.permissionsFor(botMember)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect])) {
      await interaction.reply({ content: 'Le bot doit avoir les permissions **Voir le salon** et **Se connecter** dans ce salon vocal.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    await connectConfiguredVoice(interaction.guild, channel);
    await interaction.editReply({ content: `Le bot est maintenant connecté à <#${channel.id}>. Il reste silencieux et ne diffuse pas d’audio.` });
    return;
  }

  if (name === 'logs') {
    const subcommand = interaction.options.getSubcommand();
    if (!settings.logChannelId) {
      await interaction.reply({ content: 'Aucun salon de journal n’est configuré. Utilisez `/securitas` pour en choisir un.', ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    const channel = await interaction.guild.channels.fetch(settings.logChannelId);
    if (!channel?.isTextBased() || !channel.messages) {
      await interaction.editReply({ content: 'Le salon de journal configuré n’est plus accessible ou ne permet pas de consulter les messages.' });
      return;
    }
    const recent = await channel.messages.fetch({ limit: 50 });
    const entries = recent
      .filter((message) => message.author.id === interaction.client.user.id && (message.content || message.embeds.length))
      .first(10);
    if (entries.length === 0) {
      await interaction.editReply({ content: 'Aucune entrée récente publiée par le bot n’a été trouvée dans le salon de journal.' });
      return;
    }
    const embed = new EmbedBuilder()
      .setTitle('Dernières entrées du journal')
      .setColor(0x5865f2)
      .setDescription(entries.map((message) => {
        const detail = message.embeds[0]
          ? [message.embeds[0].title, ...message.embeds[0].fields.map((field) => `${field.name} : ${field.value}`)].filter(Boolean).join(' — ')
          : message.content;
        const excerpt = detail.replace(/\s+/g, ' ').slice(0, 300);
        return `• <t:${Math.floor(message.createdTimestamp / 1000)}:R> — ${excerpt}`;
      }).join('\n').slice(0, 4000))
      .setFooter({ text: `Salon : #${channel.name}` });
    await interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
    return;
  }

  if (name === 'dire') {
    const channel = interaction.options.getChannel('salon') ?? interaction.channel;
    if (!channel?.isTextBased() || typeof channel.send !== 'function') {
      await interaction.reply({ content: 'Choisissez un salon textuel dans lequel le bot peut envoyer des messages.', ephemeral: true });
      return;
    }
    const message = interaction.options.getString('message', true);
    await interaction.deferReply({ ephemeral: true });
    await channel.send({ content: message, allowedMentions: { parse: [] } });
    await interaction.editReply({ content: `Le message a été publié dans <#${channel.id}>. Les mentions ne génèrent aucune notification.` });
    return;
  }

  if (name === 'purge') {
    const channel = interaction.channel;
    if (typeof channel?.messages?.fetch !== 'function' || typeof channel.bulkDelete !== 'function') {
      await interaction.reply({ content: 'Cette commande doit être utilisée dans un salon textuel où les messages peuvent être supprimés.', ephemeral: true });
      return;
    }
    const amount = interaction.options.getInteger('amount');
    const from = interaction.options.getUser('from');
    await interaction.deferReply({ ephemeral: true });
    const fetched = await channel.messages.fetch({ limit: 100 });
    const cutoff = Date.now() - 13 * 24 * 3600 * 1000;
    const candidates = [...fetched.values()].filter((m) => m.createdTimestamp > cutoff && (!from || m.author.id === from.id)).slice(0, amount);
    if (candidates.length === 0) {
      await interaction.editReply({ content: 'Aucun message récent ne correspond aux critères de suppression dans ce salon.' });
      return;
    }
    const deleted = await channel.bulkDelete(candidates, true);
    await interaction.editReply({ content: `${deleted.size} message(s) ont été supprimés dans ce salon.` });
    await log(interaction, settings, 'purge', from, `${deleted.size} message(s) supprimé(s) dans <#${interaction.channelId}>`);
    return;
  }

  if (name === 'slowmode') {
    const channel = interaction.channel;
    if (typeof channel?.setRateLimitPerUser !== 'function') {
      await interaction.reply({ content: 'Cette commande doit être utilisée dans un salon textuel qui prend en charge le mode lent.', ephemeral: true });
      return;
    }
    const seconds = interaction.options.getInteger('seconds');
    await interaction.deferReply({ ephemeral: true });
    await channel.setRateLimitPerUser(seconds);
    await interaction.editReply({ content: seconds === 0 ? 'Le mode lent a été désactivé dans ce salon.' : `Le mode lent a été défini à un message toutes les ${seconds} seconde(s).` });
    return;
  }

  if (name === 'lock' || name === 'unlock') {
    if (!interaction.channel?.permissionOverwrites) {
      await interaction.reply({ content: 'Cette commande doit être utilisée dans un salon textuel qui prend en charge les permissions individuelles.', ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
      SendMessages: name === 'lock' ? false : null,
    });
    await interaction.editReply({ content: name === 'lock' ? 'Le salon a été verrouillé. Les membres ne peuvent plus y envoyer de messages.' : 'Le salon a été déverrouillé. Les membres peuvent de nouveau y envoyer des messages.' });
    await log(interaction, settings, name, null, `<#${interaction.channelId}>`);
    return;
  }

  if (name === 'unban') {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'liste') {
      await interaction.deferReply({ ephemeral: true });
      const bans = await interaction.guild.bans.fetch();
      if (bans.size === 0) {
        await interaction.editReply({ content: 'Aucun compte n’est actuellement banni de ce serveur.' });
        return;
      }
      const pageSize = 20;
      const pageCount = Math.ceil(bans.size / pageSize);
      const page = Math.min(interaction.options.getInteger('page') ?? 1, pageCount);
      const entries = [...bans.values()].slice((page - 1) * pageSize, page * pageSize);
      const embed = new EmbedBuilder()
        .setTitle('Comptes bannis')
        .setColor(0xed4245)
        .setDescription(entries.map((ban) => `• **${ban.user.username}** — \`${ban.user.id}\`${ban.reason ? ` — ${ban.reason.slice(0, 180)}` : ''}`).join('\n').slice(0, 4000))
        .setFooter({ text: `Page ${page}/${pageCount} · ${bans.size} compte(s)` });
      await interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
      return;
    }
    const id = interaction.options.getString('user_id', true).trim();
    if (!/^\d{17,20}$/.test(id)) {
      await interaction.reply({ content: 'Le format de cet identifiant Discord est invalide. Saisissez un identifiant utilisateur composé de 17 à 20 chiffres.', ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    await interaction.guild.members.unban(id, getReason());
    await interaction.editReply({ content: `Le bannissement du compte portant l’identifiant ${id} a été levé.` });
    await log(interaction, settings, 'unban', { id, tag: id }, null);
    return;
  }

  const target = interaction.options.getUser('user');
  const member = await fetchMember(interaction.guild, target.id);
  if (name === 'nickname') {
    if (!member) {
      await interaction.reply({ content: 'Ce membre n’appartient pas à ce serveur.', ephemeral: true });
      return;
    }
    const moderator = await fetchMember(interaction.guild, interaction.user.id);
    const check = canActOn(interaction, member, moderator);
    if (!check.ok) {
      await interaction.reply({ content: check.why, ephemeral: true });
      return;
    }
    const nickname = interaction.options.getString('nickname');
    await interaction.deferReply();
    await member.setNickname(nickname, getReason());
    await interaction.editReply({ content: nickname ? `Le pseudonyme de ${target.tag} a été défini sur « ${nickname} ».` : `Le pseudonyme de ${target.tag} a été réinitialisé.` });
    await log(interaction, settings, 'nickname', target, nickname || 'Pseudonyme réinitialisé');
    return;
  }

  if (name === 'warnings') {
    const list = settings.warnings[target.id] ?? [];
    const entries = list.slice(-10).map((warning, index) => `${list.length - Math.min(list.length, 10) + index + 1}. ${warning.reason} (par <@${warning.by}>, <t:${Math.floor(warning.at / 1000)}:R>)`);
    const warningText = list.length === 0
      ? `Aucun avertissement n’est consigné pour ${target.tag}.`
      : `Avertissements consignés pour ${target.tag} (les 10 plus récents au maximum) :\n${entries.join('\n')}`;
    await interaction.reply({
      content: warningText.slice(0, 1900),
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
    return;
  }

  if (name === 'unwarn') {
    const list = settings.warnings[target.id] ?? [];
    const number = interaction.options.getInteger('number', true);
    if (!Number.isSafeInteger(number) || number < 1 || number > list.length) {
      await interaction.reply({ content: `Cet avertissement n’existe pas. ${target.tag} a actuellement ${list.length} avertissement(s).`, ephemeral: true });
      return;
    }
    const [removed] = list.splice(number - 1, 1);
    if (list.length === 0) delete settings.warnings[target.id];
    await interaction.deferReply({ ephemeral: true });
    await save();
    await interaction.editReply({ content: `L’avertissement n° ${number} de ${target.tag} a été retiré.`, allowedMentions: { parse: [] } });
    await log(interaction, settings, 'unwarn', target, `Avertissement n° ${number} retiré : ${removed.reason}`);
    return;
  }

  if (name === 'clearwarnings') {
    delete settings.warnings[target.id];
    await interaction.deferReply({ ephemeral: true });
    await save();
    await interaction.editReply({ content: `Les avertissements consignés pour ${target.tag} ont été supprimés.` });
    await log(interaction, settings, 'clearwarnings', target, null);
    return;
  }

  const moderator = await fetchMember(interaction.guild, interaction.user.id);
  const check = canActOn(interaction, member, moderator);
  if (!check.ok) {
    await interaction.reply({ content: check.why, ephemeral: true });
    return;
  }

  if (name === 'warn') {
    if (!member) {
      await interaction.reply({ content: 'Un avertissement ne peut être consigné que pour un membre de ce serveur.', ephemeral: true });
      return;
    }
    const why = getReason();
    const list = (settings.warnings[target.id] ??= []);
    list.push({ reason: why, by: interaction.user.id, at: Date.now() });
    await interaction.deferReply();
    await save();
    await tell(target, interaction.guild, `Un avertissement a été consigné à votre encontre (avertissement n° ${list.length}).\nMotif : ${why}`);
    await interaction.editReply({ content: `Un avertissement a été consigné pour ${target.tag} (${list.length} au total). Motif : ${why}`, allowedMentions: { parse: [] } });
    await log(interaction, settings, 'warn', target, `${why} (avertissement n° ${list.length})`);
    return;
  }

  if (name === 'timeout') {
    if (!member) {
      await interaction.reply({ content: 'Ce membre n’appartient pas à ce serveur.', ephemeral: true });
      return;
    }
    const minutes = interaction.options.getInteger('minutes');
    const why = getReason();
    await interaction.deferReply();
    await member.timeout(minutes * 60 * 1000, why);
    await tell(target, interaction.guild, `Votre droit de participer à la conversation a été suspendu pour ${minutes} minute(s).\nMotif : ${why}`);
    await interaction.editReply({ content: `La participation de ${target.tag} à la conversation a été suspendue pour ${minutes} minute(s). Motif : ${why}`, allowedMentions: { parse: [] } });
    await log(interaction, settings, 'timeout', target, `${minutes} minute(s): ${why}`);
    return;
  }

  if (name === 'untimeout') {
    if (!member) {
      await interaction.reply({ content: 'Ce membre n’appartient pas à ce serveur.', ephemeral: true });
      return;
    }
    await interaction.deferReply();
    await member.timeout(null);
    await interaction.editReply({ content: `La suspension temporaire de prise de parole a pris fin pour ${target.tag}.` });
    await log(interaction, settings, 'untimeout', target, null);
    return;
  }

  if (name === 'kick') {
    if (!member) {
      await interaction.reply({ content: 'Ce membre n’appartient pas à ce serveur.', ephemeral: true });
      return;
    }
    const why = getReason();
    await interaction.deferReply();
    await member.kick(why);
    await tell(target, interaction.guild, `Vous avez été exclu du serveur.\nMotif : ${why}`);
    await interaction.editReply({ content: `${target.tag} a été exclu du serveur. Motif : ${why}`, allowedMentions: { parse: [] } });
    await log(interaction, settings, 'kick', target, why);
    return;
  }

  if (name === 'ban') {
    const days = interaction.options.getInteger('delete_days') ?? 0;
    const why = getReason();
    await interaction.deferReply();
    await interaction.guild.members.ban(target.id, { reason: why, deleteMessageSeconds: days * 24 * 3600 });
    await tell(target, interaction.guild, `Vous avez été banni du serveur.\nMotif : ${why}`);
    await interaction.editReply({ content: `${target.tag} a été banni du serveur. Motif : ${why}`, allowedMentions: { parse: [] } });
    await log(interaction, settings, 'ban', target, why);
  }
}

export async function handleHelpInteraction(interaction) {
  if (!interaction.isStringSelectMenu() || interaction.customId !== 'help:category') return false;
  const [groupValue] = interaction.values;
  const embed = helpPanelEmbed(groupValue);
  if (!embed) {
    await interaction.reply({ content: 'Cette catégorie de commandes n’existe pas.', ephemeral: true });
    return true;
  }
  await interaction.update({
    embeds: [embed],
    components: helpPanelComponents(),
    allowedMentions: { parse: [] },
  });
  return true;
}

export async function handleTicketInteraction(interaction) {
  const isOpenButton = interaction.isButton() && interaction.customId === 'ticket:open';
  const isCloseButton = interaction.isButton() && interaction.customId === 'ticket:close';
  const isCreateModal = interaction.isModalSubmit() && interaction.customId === 'ticket:create';
  if (!isOpenButton && !isCloseButton && !isCreateModal) return false;
  if (!interaction.inGuild()) {
    await interaction.reply({ content: 'Les tickets sont disponibles uniquement sur un serveur Discord.', ephemeral: true });
    return true;
  }

  if (isOpenButton) {
    const subject = new TextInputBuilder()
      .setCustomId('subject')
      .setLabel('Sujet de votre demande')
      .setPlaceholder('Ex. : Besoin d’aide avec une commande')
      .setStyle(TextInputStyle.Short)
      .setMaxLength(100)
      .setRequired(true);
    const details = new TextInputBuilder()
      .setCustomId('details')
      .setLabel('Décrivez votre demande')
      .setPlaceholder('Ajoutez les informations utiles pour notre équipe.')
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(1000)
      .setRequired(true);
    const modal = new ModalBuilder()
      .setCustomId('ticket:create')
      .setTitle('Nouvelle demande de support')
      .addComponents(
        new ActionRowBuilder().addComponents(subject),
        new ActionRowBuilder().addComponents(details),
      );
    await interaction.showModal(modal);
    return true;
  }

  if (isCloseButton) {
    const settings = await getGuild(interaction.guildId);
    const ownerId = ticketOwner(interaction.channel);
    if (!ownerId) {
      await interaction.reply({ content: 'Ce ticket est déjà clôturé ou n’est pas reconnu.', ephemeral: true });
      return true;
    }
    if (!(await canManageTicket(interaction, settings, ownerId))) {
      await interaction.reply({ content: 'Seul le demandeur ou un membre autorisé de l’équipe de support peut clôturer ce ticket.', ephemeral: true });
      return true;
    }
    await interaction.deferReply({ ephemeral: true });
    await closeTicket(interaction.channel, ownerId, settings.ticketSupportRoleId);
    await interaction.message.edit({ components: ticketCloseComponents(true) });
    await interaction.editReply({ content: 'Le ticket a été clôturé. Son historique reste accessible à l’équipe de support.' });
    return true;
  }

  await interaction.deferReply({ ephemeral: true });
  const settings = await getGuild(interaction.guildId);
  const subject = interaction.fields.getTextInputValue('subject').trim();
  const details = interaction.fields.getTextInputValue('details').trim();
  if (!subject || !details) {
    await interaction.editReply({ content: 'Le sujet et la description doivent être renseignés.' });
    return true;
  }
  const result = await createTicket(interaction.guild, interaction.user, interaction.client, settings, subject, details);
  const response = {
    created: `Votre ticket a été créé : <#${result.channel.id}>.`,
    existing: `Vous avez déjà un ticket ouvert : <#${result.channel.id}>.`,
    pending: 'La création de votre ticket est déjà en cours. Veuillez patienter quelques secondes.',
    unconfigured: 'Le système de tickets n’est pas configuré. Un administrateur doit utiliser `/tickets`.',
  };
  await interaction.editReply({ content: response[result.status] });
  return true;
}

export async function handleConfigInteraction(interaction) {
  const isConfigButton = interaction.isButton()
    && (interaction.customId.startsWith('config:') || interaction.customId.startsWith('warboubou:'));
  const isConfigSelect = (interaction.isStringSelectMenu?.() || interaction.isChannelSelectMenu?.() || interaction.isRoleSelectMenu?.())
    && (interaction.customId.startsWith('config:') || interaction.customId.startsWith('warboubou:') || interaction.customId === 'securitas:dashboard');
  const isConfigModal = interaction.isModalSubmit()
    && (interaction.customId.startsWith('config:save:') || interaction.customId.startsWith('warboubou:save:'));
  if (!isConfigButton && !isConfigSelect && !isConfigModal) return false;
  if (!interaction.inGuild()) {
    await interaction.reply({ content: 'La configuration est disponible uniquement sur un serveur Discord.', ephemeral: true });
    return true;
  }
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: 'La permission « Gérer le serveur » est requise pour modifier ces paramètres.', ephemeral: true });
    return true;
  }

  const settings = await getGuild(interaction.guildId);
  const isWarBoubou = interaction.customId.startsWith('warboubou:');
  const updateConfig = (key) => interaction.update({
    embeds: [isWarBoubou ? warBoubouEmbed(settings) : configEmbed(settings, key)],
    components: configPanelComponents(settings, isWarBoubou ? 'security' : key),
    allowedMentions: { parse: [] },
  });

  if (isConfigSelect && interaction.isChannelSelectMenu()) {
    const channelId = interaction.values[0];
    const channel = interaction.guild.channels.cache.get(channelId);
    const selections = {
      'config:channel:logs': { key: 'logs', valid: channel?.type === ChannelType.GuildText, save: () => { settings.logChannelId = channelId; } },
      'config:channel:welcome': { key: 'welcome', valid: channel?.type === ChannelType.GuildText, save: () => { settings.welcome.channelId = channelId; } },
      'config:channel:leave': { key: 'leave', valid: channel?.type === ChannelType.GuildText, save: () => { settings.leave.channelId = channelId; } },
      'config:channel:ticketCategory': { key: 'tickets', valid: channel?.type === ChannelType.GuildCategory, save: () => { settings.ticketCategoryId = channelId; } },
    };
    const selection = selections[interaction.customId];
    if (!selection || !selection.valid) {
      await interaction.reply({ content: 'Le salon sélectionné n’est pas valide pour ce réglage.', ephemeral: true });
      return true;
    }
    selection.save();
    await save();
    await updateConfig(selection.key);
    return true;
  }

  if (isConfigSelect && interaction.isStringSelectMenu()) {
    if (interaction.customId === 'securitas:dashboard') {
      const key = interaction.values[0];
      if (key === 'home') {
        await interaction.update({
          embeds: [securitasDashboardEmbed()],
          components: [securitasDashboardSelect()],
          allowedMentions: { parse: [] },
        });
        return true;
      }
      if (!SECURITAS_PANEL_OPTIONS.some((option) => option.value === key)) {
        await interaction.reply({ content: 'Ce panneau de configuration n’existe pas.', ephemeral: true });
        return true;
      }
      await interaction.update({
        embeds: [key === 'security' ? warBoubouEmbed(settings) : configEmbed(settings, key)],
        components: configPanelComponents(settings, key),
        allowedMentions: { parse: [] },
      });
      return true;
    }
    if (!['config:select:antiLinkMode', 'warboubou:select:antiLinkMode'].includes(interaction.customId)
      || !['invites', 'all'].includes(interaction.values[0])) {
      await interaction.reply({ content: 'Cette option de configuration n’est pas reconnue.', ephemeral: true });
      return true;
    }
    settings.security.antiLink.mode = interaction.values[0];
    await save();
    await updateConfig('antiLink');
    return true;
  }

  if (isConfigSelect && interaction.isRoleSelectMenu()) {
    const role = interaction.guild.roles.cache.get(interaction.values[0]);
    if (!role || role.id === interaction.guildId) {
      await interaction.reply({ content: 'Le rôle sélectionné n’est pas valide.', ephemeral: true });
      return true;
    }
    const roleTargets = {
      'config:role:antiLink': { key: 'antiLink', save: () => { settings.security.antiLink.exemptRoleId = role.id; } },
      'warboubou:role:antiLink': { key: 'antiLink', save: () => { settings.security.antiLink.exemptRoleId = role.id; } },
      'config:role:ticketSupport': { key: 'tickets', save: () => { settings.ticketSupportRoleId = role.id; } },
      'config:role:verification': { key: 'verification', save: () => { settings.security.verification.roleId = role.id; } },
    };
    const target = roleTargets[interaction.customId];
    if (!target) {
      await interaction.reply({ content: 'Cette sélection de rôle n’est pas reconnue.', ephemeral: true });
      return true;
    }
    if (target.key === 'verification') {
      const botMember = interaction.guild.members.me;
      if (role.managed || !botMember?.permissions.has(PermissionFlagsBits.ManageRoles) || role.position >= botMember.roles.highest.position) {
        await interaction.reply({ content: 'Choisissez un rôle non géré, placé sous le rôle le plus élevé du bot. Le bot doit aussi avoir **Gérer les rôles**.', ephemeral: true });
        return true;
      }
    }
    target.save();
    await save();
    await updateConfig(target.key);
    return true;
  }

  if (isConfigButton) {
    const language = interaction.customId.match(/^config:set:language:(fr|en)$/);
    if (language) {
      settings.security.language = language[1];
      await save();
      await updateConfig('language');
      return true;
    }

    const toggle = interaction.customId.match(/^(config|warboubou):set:(antiLink|antiSpam|antiRaid|verification|welcome|leave|welcomePing):toggle$/);
    if (toggle) {
      const [, , setting] = toggle;
      if (setting === 'verification' && !settings.security.verification.enabled && !settings.security.verification.roleId) {
        await interaction.reply({ content: 'Choisissez d’abord le rôle à attribuer après validation.', ephemeral: true });
        return true;
      }
      if (setting === 'welcomePing') settings.welcome.ping = !settings.welcome.ping;
      else if (setting === 'antiLink') settings.security.antiLink.enabled = !settings.security.antiLink.enabled;
      else if (setting === 'antiSpam' || setting === 'antiRaid') {
        settings.security[setting].enabled = !settings.security[setting].enabled;
      } else if (setting === 'verification') {
        settings.security.verification.enabled = !settings.security.verification.enabled;
      } else {
        settings[setting].enabled = !settings[setting].enabled;
      }
      await save();
      await updateConfig(setting === 'welcomePing' ? 'welcome' : setting);
      return true;
    }

    const clear = {
      'config:clear:logs': { key: 'logs', save: () => { settings.logChannelId = null; } },
      'config:clear:antiLinkRole': { key: 'antiLink', save: () => { settings.security.antiLink.exemptRoleId = null; } },
      'warboubou:clear:antiLinkRole': { key: 'antiLink', save: () => { settings.security.antiLink.exemptRoleId = null; } },
      'config:clear:ticketRole': { key: 'tickets', save: () => { settings.ticketSupportRoleId = null; } },
      'config:clear:ticketCategory': { key: 'tickets', save: () => { settings.ticketCategoryId = null; } },
      'config:clear:verificationRole': {
        key: 'verification',
        save: () => {
          settings.security.verification.roleId = null;
          settings.security.verification.enabled = false;
        },
      },
      'config:clear:image:welcome': { key: 'welcome', save: () => { settings.welcome.imagePath = null; } },
      'config:clear:image:leave': { key: 'leave', save: () => { settings.leave.imagePath = null; } },
    }[interaction.customId];
    if (clear) {
      const previousImage = interaction.customId.startsWith('config:clear:image:')
        ? settings[clear.key].imagePath
        : null;
      clear.save();
      await save();
      if (previousImage) await removeMemberEventImage(previousImage);
      await updateConfig(clear.key);
      return true;
    }

    if (interaction.customId === 'config:publish:verification') {
      const channel = interaction.channel;
      if (!channel?.isTextBased() || typeof channel.send !== 'function') {
        await interaction.reply({ content: 'Le panneau doit être publié depuis un salon textuel.', ephemeral: true });
        return true;
      }
      if (!settings.security.verification.roleId) {
        await interaction.reply({ content: 'Choisissez d’abord le rôle à attribuer après validation.', ephemeral: true });
        return true;
      }
      await channel.send({
        embeds: [new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle('Vérification du serveur')
          .setDescription('Pour accéder au serveur, cliquez sur le bouton ci-dessous et recopiez les caractères affichés dans l’image.')],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('verification:start').setLabel('Commencer la vérification').setStyle(ButtonStyle.Success),
        )],
      });
      await interaction.reply({ content: `Le panneau de vérification a été publié dans <#${channel.id}>.`, ephemeral: true });
      return true;
    }

    if (interaction.customId === 'config:preview:welcome' || interaction.customId === 'config:preview:leave') {
      const event = interaction.customId.endsWith(':welcome') ? 'welcome' : 'leave';
      const channelId = settings[event].channelId;
      if (!channelId) {
        await interaction.reply({ content: 'Choisissez d’abord le salon de destination dans ce panneau.', ephemeral: true });
        return true;
      }
      const channel = await interaction.guild.channels.fetch(channelId);
      if (!channel?.isTextBased() || typeof channel.send !== 'function') {
        await interaction.reply({ content: 'Le salon configuré n’est plus disponible. Choisissez-en un autre.', ephemeral: true });
        return true;
      }
      await channel.send(announcementPreview(settings, interaction.guild, event));
      await interaction.reply({ content: `L’aperçu a été envoyé dans <#${channel.id}>. Aucune mention ne sera déclenchée.`, ephemeral: true });
      return true;
    }

    if (interaction.customId === 'config:preview:tickets' || interaction.customId === 'config:publish:tickets') {
      const channel = interaction.channel;
      if (!channel?.isTextBased() || typeof channel.send !== 'function') {
        await interaction.reply({ content: 'Cette action doit être utilisée dans un salon textuel.', ephemeral: true });
        return true;
      }
      if (interaction.customId === 'config:publish:tickets' && !settings.ticketCategoryId) {
        await interaction.reply({ content: 'Choisissez d’abord la catégorie des tickets dans ce panneau.', ephemeral: true });
        return true;
      }
      await channel.send({
        embeds: [ticketPanelEmbed(settings)],
        components: interaction.customId === 'config:publish:tickets' ? ticketPanelComponents() : [],
        allowedMentions: { parse: [] },
      });
      await interaction.reply({
        content: interaction.customId === 'config:publish:tickets'
          ? `Le panneau actif a été publié dans <#${channel.id}>.`
          : `L’aperçu du panneau a été publié dans <#${channel.id}>.`,
        ephemeral: true,
      });
      return true;
    }

    const edit = interaction.customId.match(/^(config|warboubou):edit:(antiSpam|antiRaid|welcome|leave|tickets)$/);
    if (edit) {
      const [, prefix, key] = edit;
      const modal = key === 'welcome' || key === 'leave'
        ? announcementModal(settings, key)
        : configModalFor(settings, key, prefix);
      await interaction.showModal(modal);
      return true;
    }

    if (!interaction.customId.startsWith('config:') && !interaction.customId.startsWith('warboubou:')) {
      await interaction.reply({ content: 'Cette action de configuration n’est pas reconnue.', ephemeral: true });
      return true;
    }
    await interaction.reply({ content: 'Cette action de configuration n’est pas reconnue.', ephemeral: true });
    return true;
  }

  const savePrefix = isWarBoubou ? 'warboubou:save:' : 'config:save:';
  const key = interaction.customId.slice(savePrefix.length);
  if (key === 'antiSpam') {
    const maxMessages = boundedInteger(modalValue(interaction, 'maximum'), 3, 15);
    const intervalSeconds = boundedInteger(modalValue(interaction, 'interval'), 3, 60);
    const timeoutMinutes = boundedInteger(modalValue(interaction, 'timeout'), 1, 60);
    if (maxMessages === null || intervalSeconds === null || timeoutMinutes === null) {
      await interaction.reply({ content: 'Valeurs anti-spam invalides. Vérifiez les plages indiquées dans chaque champ.', ephemeral: true });
      return true;
    }
    Object.assign(settings.security.antiSpam, { maxMessages, intervalSeconds, timeoutMinutes });
  } else if (key === 'antiRaid') {
    const joinThreshold = boundedInteger(modalValue(interaction, 'threshold'), 3, 30);
    const intervalSeconds = boundedInteger(modalValue(interaction, 'interval'), 5, 120);
    const protectionMinutes = boundedInteger(modalValue(interaction, 'duration'), 1, 60);
    if (joinThreshold === null || intervalSeconds === null || protectionMinutes === null) {
      await interaction.reply({ content: 'Valeurs anti-raid invalides. Vérifiez les plages indiquées dans chaque champ.', ephemeral: true });
      return true;
    }
    Object.assign(settings.security.antiRaid, { joinThreshold, intervalSeconds, protectionMinutes });
  } else if (key === 'welcome' || key === 'leave') {
    const message = modalValue(interaction, 'message');
    if (!message) {
      await interaction.reply({ content: 'Le texte de l’annonce ne peut pas être vide.', ephemeral: true });
      return true;
    }
    settings[key].message = message;
  } else if (key === 'tickets') {
    const title = modalValue(interaction, 'title');
    const description = modalValue(interaction, 'description');
    if (!title || !description) {
      await interaction.reply({ content: 'Le titre et les instructions du panneau ne peuvent pas être vides.', ephemeral: true });
      return true;
    }
    Object.assign(settings, { ticketPanelTitle: title, ticketPanelDescription: description });
  } else {
    await interaction.reply({ content: 'Cette action de configuration n’est pas reconnue.', ephemeral: true });
    return true;
  }

  await save();
  await updateConfig(key);
  return true;
}
