import {
  ActionRowBuilder,
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
import { entersState, joinVoiceChannel, VoiceConnectionStatus, getVoiceConnection } from '@discordjs/voice';
import { getGuild, removeMemberEventImage, save, saveMemberEventImage } from './store.js';

const reason = (o) => o.setName('reason').setDescription('Motif communiqué au membre et consigné dans le journal').setMaxLength(400);
const user = (o) => o.setName('user').setDescription('Membre visé par cette action').setRequired(true);
const announcementConfiguration = (option, event) => {
  const isWelcome = event === 'welcome';
  const command = option
    .setName(isWelcome ? 'bienvenue' : 'depart')
    .setDescription(isWelcome ? 'Configurer l’annonce d’arrivée des membres' : 'Configurer l’annonce de départ des membres')
    .addBooleanOption((o) => o.setName('actif').setDescription('Activer ou désactiver cette annonce').setRequired(true))
    .addChannelOption((o) => o.setName('salon').setDescription('Salon où publier l’annonce').addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addStringOption((o) => o.setName('texte').setDescription('Texte avec {user}, {username}, {server} ou {memberCount}').setMaxLength(1000))
    .addAttachmentOption((o) => o.setName('image').setDescription('Image PNG, JPEG, GIF ou WebP de 8 Mo maximum'))
    .addBooleanOption((o) => o.setName('effacer_image').setDescription('Supprimer l’image personnalisée actuelle'));
  if (isWelcome) command.addBooleanOption((o) => o.setName('ping').setDescription('Mentionner le nouvel arrivant'));
  return command;
};

export const commands = [
  new SlashCommandBuilder().setName('aide').setDescription('Consulter les commandes disponibles et les permissions requises'),
  new SlashCommandBuilder().setName('warn').setDescription('Consigner un avertissement officiel à l’intention d’un membre').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(user).addStringOption((o) => reason(o).setRequired(true)),
  new SlashCommandBuilder().setName('warnings').setDescription('Consulter les avertissements consignés pour un membre').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addUserOption(user),
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
  new SlashCommandBuilder().setName('vocal').setDescription('Connecter ou déconnecter le bot d’un salon vocal').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((o) => o.setName('rejoindre').setDescription('Connecter le bot à un salon vocal')
      .addChannelOption((option) => option.setName('salon').setDescription('Salon vocal à rejoindre').addChannelTypes(ChannelType.GuildVoice).setRequired(true)))
    .addSubcommand((o) => o.setName('quitter').setDescription('Déconnecter le bot du salon vocal actuel')),
  new SlashCommandBuilder().setName('logs').setDescription('Consulter les dernières entrées du journal de modération').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((o) => o.setName('afficher').setDescription('Consulter les dix dernières entrées du journal')),
  new SlashCommandBuilder()  .setName('config').setDescription('Configurer les protections, journaux, annonces et tickets du serveur').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((o) => o.setName('panneau').setDescription('Ouvrir le panneau interactif de configuration'))
    .addSubcommand((o) => o.setName('afficher').setDescription('Consulter la configuration actuelle des protections'))
    .addSubcommand((o) => o.setName('langue').setDescription('Définir la langue des notifications de sécurité')
      .addStringOption((option) => option.setName('language').setDescription('Langue utilisée pour les notifications').setRequired(true)
        .addChoices({ name: 'Français', value: 'fr' }, { name: 'English', value: 'en' })))
    .addSubcommand((o) => o.setName('antilien').setDescription('Définir les règles de publication des liens')
      .addBooleanOption((option) => option.setName('actif').setDescription('Indiquer si la protection doit être active').setRequired(true))
      .addStringOption((option) => option.setName('mode').setDescription('Catégories de liens à bloquer').setRequired(true)
        .addChoices({ name: 'Invitations Discord uniquement', value: 'invites' }, { name: 'Tous les liens', value: 'all' }))
      .addRoleOption((option) => option.setName('role_exempt').setDescription('Rôle autorisé à publier des liens'))
      .addBooleanOption((option) => option.setName('effacer_exemption').setDescription('Supprimer le rôle actuellement exempté')))
    .addSubcommand((o) => o.setName('antispam').setDescription('Définir les seuils de détection du spam')
      .addBooleanOption((option) => option.setName('actif').setDescription('Indiquer si la protection doit être active').setRequired(true))
      .addIntegerOption((option) => option.setName('maximum').setDescription('Nombre de messages déclenchant une intervention').setMinValue(3).setMaxValue(15).setRequired(true))
      .addIntegerOption((option) => option.setName('intervalle').setDescription('Durée de la période de détection, en secondes').setMinValue(3).setMaxValue(60).setRequired(true))
      .addIntegerOption((option) => option.setName('timeout').setDescription('Durée de suspension appliquée, en minutes').setMinValue(1).setMaxValue(60).setRequired(true)))
    .addSubcommand((o) => o.setName('antiraid').setDescription('Définir les seuils de détection des arrivées massives')
      .addBooleanOption((option) => option.setName('actif').setDescription('Indiquer si la protection doit être active').setRequired(true))
      .addIntegerOption((option) => option.setName('seuil').setDescription('Nombre d’arrivées déclenchant la protection').setMinValue(3).setMaxValue(30).setRequired(true))
      .addIntegerOption((option) => option.setName('intervalle').setDescription('Durée de la période de détection, en secondes').setMinValue(5).setMaxValue(120).setRequired(true))
      .addIntegerOption((option) => option.setName('duree').setDescription('Durée du niveau de vérification renforcé, en minutes').setMinValue(1).setMaxValue(60).setRequired(true)))
    .addSubcommand((option) => announcementConfiguration(option, 'welcome'))
    .addSubcommand((option) => announcementConfiguration(option, 'leave')),
  new SlashCommandBuilder().setName('ticket').setDescription('Gérer les demandes d’assistance dans des salons privés')
    .addSubcommand((o) => o.setName('panel').setDescription('Publier un panneau pour ouvrir des tickets privés')
      .addChannelOption((option) => option.setName('salon').setDescription('Salon dans lequel publier le panneau').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addStringOption((option) => option.setName('titre').setDescription('Titre personnalisé du panneau').setMaxLength(100))
      .addStringOption((option) => option.setName('description').setDescription('Instructions affichées au-dessus du bouton').setMaxLength(1000)))
    .addSubcommand((o) => o.setName('create').setDescription('Créer une demande privée auprès de l’équipe de support'))
    .addSubcommand((o) => o.setName('close').setDescription('Clôturer le ticket ouvert dans ce salon'))
    .addSubcommand((o) => o.setName('add').setDescription('Accorder à un membre l’accès au ticket').addUserOption(user))
    .addSubcommand((o) => o.setName('remove').setDescription('Retirer à un membre l’accès au ticket').addUserOption(user)),
].map((c) => c.toJSON());

const COLORS = { warn: 0xfee75c, timeout: 0xe67e22, untimeout: 0x57f287, kick: 0xed4245, ban: 0x992d22, unban: 0x57f287, purge: 0x5865f2, clearwarnings: 0x57f287, lock: 0xed4245, unlock: 0x57f287, nickname: 0x5865f2 };
const ACTION_LABELS = { warn: 'Avertissement', timeout: 'Suspension temporaire', untimeout: 'Levée de suspension', kick: 'Exclusion du serveur', ban: 'Bannissement', unban: 'Levée de bannissement', purge: 'Suppression de messages', clearwarnings: 'Suppression des avertissements', lock: 'Verrouillage du salon', unlock: 'Déverrouillage du salon', nickname: 'Modification du pseudonyme' };

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

function ticketCloseComponents(disabled = false) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket:close')
      .setLabel('Clôturer le ticket')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
  )];
}

const configSections = [
  ['overview', 'Vue générale', 'Tous les réglages essentiels, réunis au même endroit.'],
  ['security', 'Sécurité', 'Langue, filtre anti-liens, anti-spam et anti-raid.'],
  ['logs', 'Journaux', 'Choisissez où publier les actions de modération.'],
  ['welcome', 'Bienvenue', 'Réglez l’annonce envoyée lors d’une arrivée.'],
  ['leave', 'Départ', 'Réglez l’annonce envoyée lorsqu’un membre quitte.'],
  ['tickets', 'Tickets', 'Définissez la catégorie et le rôle du support.'],
];

const configStatus = (enabled) => enabled ? '🟢 Activé' : '⚫ Désactivé';
const configuredChannel = (id) => id ? `<#${id}>` : '*Non configuré*';
const configuredRole = (id) => id ? `<@&${id}>` : '*Aucun rôle*';

function configPanelEmbed(settings, section = 'overview') {
  const { security } = settings;
  const embed = new EmbedBuilder()
    .setTitle('Centre de configuration')
    .setColor(0x5865f2)
    .setDescription(`**${configSections.find(([key]) => key === section)?.[1] ?? 'Vue générale'}**\n${configSections.find(([key]) => key === section)?.[2] ?? configSections[0][2]}`)
    .setFooter({ text: 'Configuration privée • Modifications enregistrées automatiquement' })
    .setTimestamp();

  if (section === 'overview') {
    embed.addFields(
      {
        name: '🛡️ Protection du serveur',
        value: `Langue : **${security.language === 'en' ? 'English' : 'Français'}**\nAnti-liens : ${configStatus(security.antiLink.enabled)}  •  Anti-spam : ${configStatus(security.antiSpam.enabled)}  •  Anti-raid : ${configStatus(security.antiRaid.enabled)}`,
      },
      { name: '📋 Journal de modération', value: configuredChannel(settings.logChannelId), inline: true },
      { name: '👋 Annonce de bienvenue', value: `${configStatus(settings.welcome.enabled)}\n${configuredChannel(settings.welcome.channelId)}`, inline: true },
      { name: '🚪 Annonce de départ', value: `${configStatus(settings.leave.enabled)}\n${configuredChannel(settings.leave.channelId)}`, inline: true },
      { name: '🎫 Système de tickets', value: `Catégorie : ${configuredChannel(settings.ticketCategoryId)}\nÉquipe : ${configuredRole(settings.ticketSupportRoleId)}` },
    );
  } else if (section === 'security') {
    embed.addFields(
      { name: '🌐 Langue des notifications', value: `**${security.language === 'en' ? 'English' : 'Français'}**`, inline: true },
      { name: '🔗 Filtre anti-liens', value: `${configStatus(security.antiLink.enabled)}\nMode : **${security.antiLink.mode === 'all' ? 'Tous les liens' : 'Invitations Discord'}**\nRôle exempté : ${configuredRole(security.antiLink.exemptRoleId)}`, inline: true },
      { name: '💬 Protection anti-spam', value: `${configStatus(security.antiSpam.enabled)}\nSeuil : **${security.antiSpam.maxMessages} messages / ${security.antiSpam.intervalSeconds} s**\nSuspension : **${security.antiSpam.timeoutMinutes} min**`, inline: true },
      { name: '🚨 Protection anti-raid', value: `${configStatus(security.antiRaid.enabled)}\nSeuil : **${security.antiRaid.joinThreshold} arrivées / ${security.antiRaid.intervalSeconds} s**\nProtection : **${security.antiRaid.protectionMinutes} min**`, inline: true },
    );
  } else if (section === 'logs') {
    embed.addFields({ name: 'Salon de destination', value: configuredChannel(settings.logChannelId) });
  } else if (section === 'welcome' || section === 'leave') {
    const announcement = settings[section];
    embed.addFields(
      { name: 'État', value: configStatus(announcement.enabled), inline: true },
      { name: 'Salon', value: configuredChannel(announcement.channelId), inline: true },
      ...(section === 'welcome' ? [{ name: 'Mention du nouvel arrivant', value: announcement.ping ? '🟢 Activée' : '⚫ Désactivée', inline: true }] : []),
      { name: 'Texte actuel', value: `> ${announcement.message.replaceAll('\n', '\n> ').slice(0, 900)}` },
      { name: 'Image personnalisée', value: announcement.imagePath ? `🟢 Configurée (gestion via \`/config ${section === 'welcome' ? 'bienvenue' : 'depart'}\`)` : '⚫ Aucune' },
    );
  } else if (section === 'tickets') {
    embed.addFields(
      { name: 'Catégorie des tickets', value: configuredChannel(settings.ticketCategoryId), inline: true },
      { name: 'Rôle de l’équipe support', value: configuredRole(settings.ticketSupportRoleId), inline: true },
      { name: 'Étape suivante', value: 'Une fois la catégorie choisie, publiez le panneau avec `/ticket panel`.' },
    );
  }
  return embed;
}

function configPageSelector(section) {
  const selector = new StringSelectMenuBuilder()
    .setCustomId('config:page')
    .setPlaceholder('Ouvrir une rubrique de configuration')
    .addOptions(configSections.map(([value, label, description]) => ({
      label,
      value,
      description,
      default: value === section,
    })));
  return new ActionRowBuilder().addComponents(selector);
}

function configButton(customId, label, style = ButtonStyle.Secondary) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
}

function configTextChannelSelector(customId, placeholder) {
  return new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .setChannelTypes(ChannelType.GuildText)
      .setMinValues(1)
      .setMaxValues(1),
  );
}

function configPageComponents(section) {
  const rows = [configPageSelector(section)];
  if (section === 'overview') {
    rows.push(new ActionRowBuilder().addComponents(configButton('config:refresh:overview', 'Actualiser')));
  } else if (section === 'security') {
    rows.push(new ActionRowBuilder().addComponents(
      configButton('config:language', 'Langue', ButtonStyle.Primary),
      configButton('config:antiLink', 'Anti-liens', ButtonStyle.Primary),
      configButton('config:antiSpam', 'Anti-spam', ButtonStyle.Primary),
      configButton('config:antiRaid', 'Anti-raid', ButtonStyle.Primary),
    ));
    rows.push(new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder().setCustomId('config:role:antiLink').setPlaceholder('Choisir le rôle exempté du filtre anti-liens').setMinValues(1).setMaxValues(1),
    ));
    rows.push(new ActionRowBuilder().addComponents(
      configButton('config:clear:antiLinkRole', 'Retirer l’exemption'),
    ));
    rows.push(new ActionRowBuilder().addComponents(
      configButton('config:refresh:security', 'Actualiser'),
    ));
  } else if (section === 'logs') {
    rows.push(configTextChannelSelector('config:channel:logs', 'Choisir le salon du journal'));
    rows.push(new ActionRowBuilder().addComponents(
      configButton('config:clear:logs', 'Désactiver le journal', ButtonStyle.Danger),
      configButton('config:refresh:logs', 'Actualiser'),
    ));
  } else if (section === 'welcome' || section === 'leave') {
    rows.push(configTextChannelSelector(`config:channel:${section}`, 'Choisir le salon de l’annonce'));
    rows.push(new ActionRowBuilder().addComponents(
      configButton(`config:edit:${section}`, 'Modifier le texte et les options', ButtonStyle.Primary),
      configButton(`config:refresh:${section}`, 'Actualiser'),
    ));
  } else if (section === 'tickets') {
    rows.push(new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId('config:channel:ticketCategory')
        .setPlaceholder('Choisir la catégorie des tickets')
        .setChannelTypes(ChannelType.GuildCategory)
        .setMinValues(1)
        .setMaxValues(1),
    ));
    rows.push(new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder().setCustomId('config:role:ticketSupport').setPlaceholder('Choisir le rôle de l’équipe support').setMinValues(1).setMaxValues(1),
    ));
    rows.push(new ActionRowBuilder().addComponents(
      configButton('config:clear:ticketRole', 'Retirer le rôle support'),
      configButton('config:refresh:tickets', 'Actualiser'),
    ));
  }
  return rows;
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

function configModalFor(settings, key) {
  const { security } = settings;
  if (key === 'language') {
    return configModal('config:save:language', 'Langue des notifications', [
      { id: 'language', label: 'Saisissez fr ou en', value: security.language, maxLength: 2 },
    ]);
  }
  if (key === 'antiLink') {
    return configModal('config:save:antiLink', 'Protection anti-liens', [
      { id: 'enabled', label: 'Protection active ? on ou off', value: security.antiLink.enabled ? 'on' : 'off', maxLength: 3 },
      { id: 'mode', label: 'Mode : invites ou all', value: security.antiLink.mode, maxLength: 7 },
    ]);
  }
  if (key === 'antiSpam') {
    return configModal('config:save:antiSpam', 'Protection anti-spam', [
      { id: 'enabled', label: 'Protection active ? on ou off', value: security.antiSpam.enabled ? 'on' : 'off', maxLength: 3 },
      { id: 'maximum', label: 'Messages avant intervention (3–15)', value: security.antiSpam.maxMessages, maxLength: 2 },
      { id: 'interval', label: 'Fenêtre en secondes (3–60)', value: security.antiSpam.intervalSeconds, maxLength: 2 },
      { id: 'timeout', label: 'Suspension en minutes (1–60)', value: security.antiSpam.timeoutMinutes, maxLength: 2 },
    ]);
  }
  return configModal('config:save:antiRaid', 'Protection anti-raid', [
    { id: 'enabled', label: 'Protection active ? on ou off', value: security.antiRaid.enabled ? 'on' : 'off', maxLength: 3 },
    { id: 'threshold', label: 'Arrivées (3–30)', value: security.antiRaid.joinThreshold, maxLength: 2 },
    { id: 'interval', label: 'Fenêtre en secondes (5–120)', value: security.antiRaid.intervalSeconds, maxLength: 3 },
    { id: 'duration', label: 'Protection en minutes (1–60)', value: security.antiRaid.protectionMinutes, maxLength: 2 },
  ]);
}

function announcementModal(settings, section) {
  const announcement = settings[section];
  const fields = [
    { id: 'enabled', label: 'Annonce active ? on ou off', value: announcement.enabled ? 'on' : 'off', maxLength: 3 },
    { id: 'message', label: 'Texte de l’annonce', value: announcement.message, maxLength: 1000, long: true },
  ];
  if (section === 'welcome') {
    fields.push({ id: 'ping', label: 'Mentionner l’arrivant ? on ou off', value: announcement.ping ? 'on' : 'off', maxLength: 3 });
  }
  return configModal(`config:save:${section}`, section === 'welcome' ? 'Annonce de bienvenue' : 'Annonce de départ', fields);
}

function modalValue(interaction, id) {
  return interaction.fields.getTextInputValue(id).trim();
}

function enabledValue(value) {
  const normalized = value.toLowerCase();
  if (normalized === 'on') return true;
  if (normalized === 'off') return false;
  return null;
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

async function handleMemberEventSettings(interaction, settings, eventType) {
  const eventSettings = settings[eventType];
  const eventName = eventType === 'welcome' ? 'bienvenue' : 'départ';
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === 'afficher') {
    const imageStatus = eventSettings.imagePath ? 'configurée' : 'aucune';
    await interaction.reply({
      content: `Annonce ${eventName} : ${eventSettings.enabled ? 'activée' : 'désactivée'}\nSalon : ${eventSettings.channelId ? `<#${eventSettings.channelId}>` : 'non défini'}\nImage : ${imageStatus}\nTexte : ${eventSettings.message}`,
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
    return;
  }

  const attachment = interaction.options.getAttachment('image');
  const clearImage = interaction.options.getBoolean('effacer_image') ?? false;
  if (attachment && clearImage) {
    await interaction.reply({ content: 'Joignez une nouvelle image ou choisissez de supprimer l’image actuelle, mais pas les deux.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const previousImage = eventSettings.imagePath;
  const imagePath = attachment
    ? await saveMemberEventImage(interaction.guildId, eventType, attachment)
    : clearImage ? null : previousImage;
  const ping = eventType === 'welcome'
    ? interaction.options.getBoolean('ping') ?? eventSettings.ping
    : false;
  eventSettings.enabled = interaction.options.getBoolean('actif', true);
  eventSettings.channelId = interaction.options.getChannel('salon', true).id;
  eventSettings.message = interaction.options.getString('texte') ?? eventSettings.message;
  eventSettings.imagePath = imagePath;
  if (eventType === 'welcome') eventSettings.ping = ping;
  await save();
  if ((attachment || clearImage) && previousImage && previousImage !== imagePath) {
    await removeMemberEventImage(previousImage);
  }

  const imageStatus = imagePath ? 'L’image personnalisée est enregistrée.' : 'Aucune image personnalisée n’est définie.';
  await interaction.editReply({
    content: `L’annonce de ${eventName} a été ${eventSettings.enabled ? 'activée' : 'désactivée'} dans <#${eventSettings.channelId}>. ${imageStatus}${eventType === 'welcome' ? ` Mention du nouvel arrivant : ${ping ? 'activée' : 'désactivée'}.` : ''}`,
  });
}

export async function handleCommand(interaction) {
  const name = interaction.commandName;
  if (name === 'aide') {
    const groups = [
      {
        name: 'Modération',
        permission: 'Modérer les membres ou disposer de la permission associée à la commande.',
        commands: ['warn', 'warnings', 'clearwarnings', 'timeout', 'untimeout', 'kick', 'ban', 'unban'],
      },
      {
        name: 'Gestion des salons',
        permission: 'Gérer les messages, les salons, les journaux ou les pseudonymes selon la commande.',
        commands: ['purge', 'slowmode', 'lock', 'unlock', 'dire', 'nickname', 'logs'],
      },
      {
        name: 'Configuration et assistance',
        permission: 'Gérer le serveur pour la configuration ; les tickets dépendent de leur configuration.',
        commands: ['config', 'ticket', 'vocal'],
      },
    ];
    const embed = new EmbedBuilder()
      .setTitle('Commandes du bot de modération')
      .setDescription('Les commandes sont disponibles dans le menu `/`. Certaines nécessitent une permission Discord spécifique.')
      .setColor(0x5865f2)
      .addFields(groups.map((group) => ({
        name: `${group.name} — ${group.permission}`,
        value: group.commands.map((commandName) => {
          const command = commands.find((entry) => entry.name === commandName);
          return `**/${commandName}** — ${command.description}`;
        }).join('\n'),
      })))
      .setFooter({ text: 'Utilisez les options proposées par Discord pour consulter les paramètres de chaque commande.' });
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  const settings = await getGuild(interaction.guildId);
  const getReason = () => interaction.options.getString('reason') || 'Aucun motif n’a été communiqué.';

  if (name === 'vocal') {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: 'La permission « Gérer le serveur » est requise pour connecter le bot à un salon vocal.', ephemeral: true });
      return;
    }
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'quitter') {
      const connection = getVoiceConnection(interaction.guildId);
      if (!connection) {
        await interaction.reply({ content: 'Le bot n’est connecté à aucun salon vocal sur ce serveur.', ephemeral: true });
        return;
      }
      connection.destroy();
      await interaction.reply({ content: 'Le bot a quitté le salon vocal.', ephemeral: true });
      return;
    }

    const channel = interaction.options.getChannel('salon', true);
    if (channel.type !== ChannelType.GuildVoice) {
      await interaction.reply({ content: 'Choisissez un salon vocal standard (les salons de scène ne sont pas pris en charge).', ephemeral: true });
      return;
    }
    const botMember = interaction.guild.members.me;
    if (!botMember || !channel.permissionsFor(botMember)?.has(PermissionFlagsBits.Connect)) {
      await interaction.reply({ content: 'Le bot n’a pas la permission **Se connecter** dans ce salon vocal.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    getVoiceConnection(interaction.guildId)?.destroy();
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: interaction.guildId,
      adapterCreator: interaction.guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: true,
    });
    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
    } catch (error) {
      connection.destroy();
      throw error;
    }
    await interaction.editReply({ content: `Le bot est maintenant connecté à <#${channel.id}>. Il reste silencieux et ne diffuse pas d’audio.` });
    return;
  }

  if (name === 'logs') {
    const subcommand = interaction.options.getSubcommand();
    if (!settings.logChannelId) {
      await interaction.reply({ content: 'Aucun salon de journal n’est configuré. Choisissez-en un dans `/config panneau` > **Journaux**.', ephemeral: true });
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

  if (name === 'config') {
    const subcommand = interaction.options.getSubcommand();
    const security = settings.security;
    if (subcommand === 'bienvenue' || subcommand === 'depart') {
      await handleMemberEventSettings(interaction, settings, subcommand === 'bienvenue' ? 'welcome' : 'leave');
      return;
    }
    if (subcommand === 'panneau') {
      await interaction.reply({
        embeds: [configPanelEmbed(settings)],
        components: configPageComponents('overview'),
        ephemeral: true,
        allowedMentions: { parse: [] },
      });
      return;
    }
    if (subcommand === 'afficher') {
      const english = security.language === 'en';
      const status = (enabled) => enabled ? (english ? 'enabled' : 'activé') : (english ? 'disabled' : 'désactivé');
      const content = english
        ? `Language: English\nAnti-link: ${status(security.antiLink.enabled)} (${security.antiLink.mode}); exempt role: ${security.antiLink.exemptRoleId ? `<@&${security.antiLink.exemptRoleId}>` : 'none'}\nAnti-spam: ${status(security.antiSpam.enabled)} (${security.antiSpam.maxMessages} messages / ${security.antiSpam.intervalSeconds}s; timeout ${security.antiSpam.timeoutMinutes} min)\nAnti-raid: ${status(security.antiRaid.enabled)} (${security.antiRaid.joinThreshold} joins / ${security.antiRaid.intervalSeconds}s; verification ${security.antiRaid.protectionMinutes} min)`
        : `Langue : français\nAnti-liens : ${status(security.antiLink.enabled)} (mode ${security.antiLink.mode}) ; rôle exempté : ${security.antiLink.exemptRoleId ? `<@&${security.antiLink.exemptRoleId}>` : 'aucun'}\nAnti-spam : ${status(security.antiSpam.enabled)} (${security.antiSpam.maxMessages} messages / ${security.antiSpam.intervalSeconds} s ; suspension ${security.antiSpam.timeoutMinutes} min)\nAnti-raid : ${status(security.antiRaid.enabled)} (${security.antiRaid.joinThreshold} arrivées / ${security.antiRaid.intervalSeconds} s ; vérification ${security.antiRaid.protectionMinutes} min)`;
      await interaction.reply({ content, ephemeral: true, allowedMentions: { parse: [] } });
      return;
    }
    if (subcommand === 'langue') {
      security.language = interaction.options.getString('language', true);
    } else if (subcommand === 'antilien') {
      const exemptRole = interaction.options.getRole('role_exempt');
      const clearExemption = interaction.options.getBoolean('effacer_exemption') ?? false;
      if (exemptRole?.id === interaction.guildId) {
        await interaction.reply({ content: 'Le rôle @everyone ne peut pas être exempté du filtre anti-liens.', ephemeral: true });
        return;
      }
      if (exemptRole && clearExemption) {
        await interaction.reply({ content: 'Sélectionnez un rôle à exempter ou choisissez de supprimer l’exemption existante. Ces deux options ne peuvent pas être utilisées simultanément.', ephemeral: true });
        return;
      }
      security.antiLink.enabled = interaction.options.getBoolean('actif', true);
      security.antiLink.mode = interaction.options.getString('mode', true);
      if (exemptRole) security.antiLink.exemptRoleId = exemptRole.id;
      else if (clearExemption) security.antiLink.exemptRoleId = null;
    } else if (subcommand === 'antispam') {
      security.antiSpam.enabled = interaction.options.getBoolean('actif', true);
      security.antiSpam.maxMessages = interaction.options.getInteger('maximum', true);
      security.antiSpam.intervalSeconds = interaction.options.getInteger('intervalle', true);
      security.antiSpam.timeoutMinutes = interaction.options.getInteger('timeout', true);
    } else if (subcommand === 'antiraid') {
      security.antiRaid.enabled = interaction.options.getBoolean('actif', true);
      security.antiRaid.joinThreshold = interaction.options.getInteger('seuil', true);
      security.antiRaid.intervalSeconds = interaction.options.getInteger('intervalle', true);
      security.antiRaid.protectionMinutes = interaction.options.getInteger('duree', true);
    }
    await save();
    const english = security.language === 'en';
    const summaries = {
      langue: english ? 'Security notifications will be sent in English.' : 'Les notifications de sécurité seront désormais en français.',
      antilien: english
        ? `Anti-link protection is ${security.antiLink.enabled ? 'enabled' : 'disabled'}; mode: ${security.antiLink.mode === 'all' ? 'all links' : 'Discord invitations'}; exempt role: ${security.antiLink.exemptRoleId ? `<@&${security.antiLink.exemptRoleId}>` : 'none'}.`
        : `Le filtre anti-liens est ${security.antiLink.enabled ? 'activé' : 'désactivé'} ; mode : ${security.antiLink.mode === 'all' ? 'tous les liens' : 'invitations Discord uniquement'} ; rôle exempté : ${security.antiLink.exemptRoleId ? `<@&${security.antiLink.exemptRoleId}>` : 'aucun'}.`,
      antispam: english
        ? `Anti-spam protection is ${security.antiSpam.enabled ? 'enabled' : 'disabled'} (${security.antiSpam.maxMessages} messages in ${security.antiSpam.intervalSeconds} seconds; timeout: ${security.antiSpam.timeoutMinutes} minutes).`
        : `Le filtre anti-spam est ${security.antiSpam.enabled ? 'activé' : 'désactivé'} (${security.antiSpam.maxMessages} messages en ${security.antiSpam.intervalSeconds} secondes ; suspension : ${security.antiSpam.timeoutMinutes} minutes).`,
      antiraid: english
        ? `Anti-raid protection is ${security.antiRaid.enabled ? 'enabled' : 'disabled'} (${security.antiRaid.joinThreshold} joins in ${security.antiRaid.intervalSeconds} seconds; verification: ${security.antiRaid.protectionMinutes} minutes).`
        : `La protection anti-raid est ${security.antiRaid.enabled ? 'activée' : 'désactivée'} (${security.antiRaid.joinThreshold} arrivées en ${security.antiRaid.intervalSeconds} secondes ; vérification renforcée : ${security.antiRaid.protectionMinutes} minutes).`,
    };
    await interaction.reply({ content: summaries[subcommand], ephemeral: true, allowedMentions: { parse: [] } });
    return;
  }

  if (name === 'purge') {
    const amount = interaction.options.getInteger('amount');
    const from = interaction.options.getUser('from');
    await interaction.deferReply({ ephemeral: true });
    const fetched = await interaction.channel.messages.fetch({ limit: 100 });
    const cutoff = Date.now() - 13 * 24 * 3600 * 1000;
    const candidates = [...fetched.values()].filter((m) => m.createdTimestamp > cutoff && (!from || m.author.id === from.id)).slice(0, amount);
    if (candidates.length === 0) {
      await interaction.editReply({ content: 'Aucun message récent ne correspond aux critères de suppression dans ce salon.' });
      return;
    }
    const deleted = await interaction.channel.bulkDelete(candidates, true);
    await interaction.editReply({ content: `${deleted.size} message(s) ont été supprimés dans ce salon.` });
    await log(interaction, settings, 'purge', from, `${deleted.size} message(s) supprimé(s) dans <#${interaction.channelId}>`);
    return;
  }

  if (name === 'slowmode') {
    const seconds = interaction.options.getInteger('seconds');
    await interaction.deferReply({ ephemeral: true });
    await interaction.channel.setRateLimitPerUser(seconds);
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

  if (name === 'ticket') {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'panel') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ content: 'La permission « Gérer le serveur » est requise pour publier un panneau de tickets.', ephemeral: true });
        return;
      }
      if (!settings.ticketCategoryId) {
        await interaction.reply({ content: 'Configurez d’abord les tickets dans `/config panneau` > **Tickets**.', ephemeral: true });
        return;
      }
      await interaction.deferReply({ ephemeral: true });
      const category = await fetchTicketCategory(interaction.guild, settings.ticketCategoryId);
      if (!category) {
        await interaction.editReply({ content: 'La catégorie enregistrée est introuvable. Choisissez-en une nouvelle dans `/config panneau` > **Tickets**.' });
        return;
      }
      const channel = interaction.options.getChannel('salon', true);
      const title = interaction.options.getString('titre') ?? 'Besoin d’aide ?';
      const description = interaction.options.getString('description')
        ?? 'Cliquez sur le bouton ci-dessous pour envoyer une demande privée à l’équipe de support. Un membre de l’équipe vous répondra dans votre ticket.';
      await channel.send({
        embeds: [new EmbedBuilder()
          .setTitle(title)
          .setDescription(description)
          .setColor(0x5865f2)
          .setFooter({ text: 'Les demandes sont visibles uniquement par vous et l’équipe de support.' })],
        components: ticketPanelComponents(),
        allowedMentions: { parse: [] },
      });
      await interaction.editReply({ content: `Le panneau de tickets a été publié dans <#${channel.id}>.` });
      return;
    }

    if (subcommand === 'create') {
      await interaction.deferReply({ ephemeral: true });
      const result = await createTicket(interaction.guild, interaction.user, interaction.client, settings, 'Demande de support', '');
      const response = {
        created: `Votre demande a été créée. Vous pouvez la consulter dans <#${result.channel.id}>.`,
        existing: `Un ticket est déjà ouvert pour vous : <#${result.channel.id}>.`,
        pending: 'La création de votre ticket est déjà en cours. Veuillez patienter quelques secondes.',
        unconfigured: 'Le système de tickets n’est pas configuré. Un administrateur doit utiliser `/config panneau` > **Tickets**.',
      };
      await interaction.editReply({ content: response[result.status] });
      return;
    }

    const channel = interaction.channel;
    const ownerId = ticketOwner(channel);
    if (!ownerId) {
      await interaction.reply({ content: 'Cette commande doit être exécutée dans le salon d’un ticket ouvert.', ephemeral: true });
      return;
    }
    if (!(await canManageTicket(interaction, settings, ownerId))) {
      await interaction.reply({ content: 'Seul le demandeur ou un membre autorisé de l’équipe de support peut gérer ce ticket.', ephemeral: true });
      return;
    }

    if (subcommand === 'close') {
      await interaction.deferReply({ ephemeral: true });
      await closeTicket(channel, ownerId, settings.ticketSupportRoleId);
      await interaction.editReply({ content: 'Le ticket a été clôturé. Son historique reste accessible à l’équipe de support.' });
      return;
    }

    const target = interaction.options.getUser('user', true);
    if (subcommand === 'remove' && target.id === ownerId) {
      await interaction.reply({ content: 'Le demandeur ne peut pas être retiré de son propre ticket.', ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    await channel.permissionOverwrites.edit(target.id, subcommand === 'add'
      ? { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true }
      : { ViewChannel: false, SendMessages: false, ReadMessageHistory: false });
    await interaction.editReply({ content: subcommand === 'add' ? `${target.tag} a été autorisé à consulter et utiliser ce ticket.` : `L’accès au ticket a été retiré à ${target.tag}.` });
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
    unconfigured: 'Le système de tickets n’est pas configuré. Un administrateur doit utiliser `/config panneau` > **Tickets**.',
  };
  await interaction.editReply({ content: response[result.status] });
  return true;
}

export async function handleConfigInteraction(interaction) {
  const isConfigButton = interaction.isButton() && interaction.customId.startsWith('config:');
  const isConfigSelect = (interaction.isStringSelectMenu?.() || interaction.isChannelSelectMenu?.() || interaction.isRoleSelectMenu?.())
    && interaction.customId.startsWith('config:');
  const isConfigModal = interaction.isModalSubmit() && interaction.customId.startsWith('config:save:');
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
  const showSection = (section) => interaction.update({
    embeds: [configPanelEmbed(settings, section)],
    components: configPageComponents(section),
    allowedMentions: { parse: [] },
  });

  if (isConfigSelect && interaction.customId === 'config:page') {
    const section = interaction.values[0];
    if (!configSections.some(([key]) => key === section)) {
      await interaction.reply({ content: 'Cette rubrique de configuration n’est pas reconnue.', ephemeral: true });
      return true;
    }
    await showSection(section);
    return true;
  }

  if (isConfigSelect && interaction.isChannelSelectMenu()) {
    const channelId = interaction.values[0];
    const channel = interaction.guild.channels.cache.get(channelId);
    const selections = {
      'config:channel:logs': { section: 'logs', valid: channel?.type === ChannelType.GuildText, save: () => { settings.logChannelId = channelId; } },
      'config:channel:welcome': { section: 'welcome', valid: channel?.type === ChannelType.GuildText, save: () => { settings.welcome.channelId = channelId; } },
      'config:channel:leave': { section: 'leave', valid: channel?.type === ChannelType.GuildText, save: () => { settings.leave.channelId = channelId; } },
      'config:channel:ticketCategory': { section: 'tickets', valid: channel?.type === ChannelType.GuildCategory, save: () => { settings.ticketCategoryId = channelId; } },
    };
    const selection = selections[interaction.customId];
    if (!selection || !selection.valid) {
      await interaction.reply({ content: 'Le salon sélectionné n’est pas valide pour ce réglage.', ephemeral: true });
      return true;
    }
    selection.save();
    await save();
    await showSection(selection.section);
    return true;
  }

  if (isConfigSelect && interaction.isRoleSelectMenu()) {
    const role = interaction.guild.roles.cache.get(interaction.values[0]);
    if (!role || role.id === interaction.guildId) {
      await interaction.reply({ content: 'Le rôle sélectionné n’est pas valide.', ephemeral: true });
      return true;
    }
    const roleTargets = {
      'config:role:antiLink': { section: 'security', save: () => { settings.security.antiLink.exemptRoleId = role.id; } },
      'config:role:ticketSupport': { section: 'tickets', save: () => { settings.ticketSupportRoleId = role.id; } },
    };
    const target = roleTargets[interaction.customId];
    if (!target) {
      await interaction.reply({ content: 'Cette sélection de rôle n’est pas reconnue.', ephemeral: true });
      return true;
    }
    target.save();
    await save();
    await showSection(target.section);
    return true;
  }

  if (isConfigButton) {
    const refresh = interaction.customId.match(/^config:refresh(?::(overview|security|logs|welcome|leave|tickets))?$/);
    if (refresh) {
      await showSection(refresh[1] ?? 'overview');
      return true;
    }
    if (interaction.customId === 'config:clear:logs') {
      settings.logChannelId = null;
      await save();
      await showSection('logs');
      return true;
    }
    if (interaction.customId === 'config:clear:antiLinkRole') {
      settings.security.antiLink.exemptRoleId = null;
      await save();
      await showSection('security');
      return true;
    }
    if (interaction.customId === 'config:clear:ticketRole') {
      settings.ticketSupportRoleId = null;
      await save();
      await showSection('tickets');
      return true;
    }
    if (interaction.customId === 'config:edit:welcome' || interaction.customId === 'config:edit:leave') {
      const section = interaction.customId.slice('config:edit:'.length);
      await interaction.showModal(announcementModal(settings, section));
      return true;
    }
    const key = interaction.customId.slice('config:'.length);
    if (!['language', 'antiLink', 'antiSpam', 'antiRaid'].includes(key)) {
      await interaction.reply({ content: 'Cette action de configuration n’est pas reconnue.', ephemeral: true });
      return true;
    }
    await interaction.showModal(configModalFor(settings, key));
    return true;
  }

  const key = interaction.customId.slice('config:save:'.length);
  if (key === 'language') {
    const language = modalValue(interaction, 'language').toLowerCase();
    if (!['fr', 'en'].includes(language)) {
      await interaction.reply({ content: 'Langue invalide : saisissez `fr` ou `en`.', ephemeral: true });
      return true;
    }
    settings.security.language = language;
  } else if (key === 'antiLink') {
    const enabled = enabledValue(modalValue(interaction, 'enabled'));
    const mode = modalValue(interaction, 'mode').toLowerCase();
    if (enabled === null || !['invites', 'all'].includes(mode)) {
      await interaction.reply({ content: 'Paramètres invalides. Utilisez `on` ou `off`, puis `invites` ou `all`.', ephemeral: true });
      return true;
    }
    Object.assign(settings.security.antiLink, { enabled, mode });
  } else if (key === 'antiSpam') {
    const enabled = enabledValue(modalValue(interaction, 'enabled'));
    const maxMessages = boundedInteger(modalValue(interaction, 'maximum'), 3, 15);
    const intervalSeconds = boundedInteger(modalValue(interaction, 'interval'), 3, 60);
    const timeoutMinutes = boundedInteger(modalValue(interaction, 'timeout'), 1, 60);
    if (enabled === null || maxMessages === null || intervalSeconds === null || timeoutMinutes === null) {
      await interaction.reply({ content: 'Valeurs anti-spam invalides. Vérifiez les plages indiquées dans chaque champ.', ephemeral: true });
      return true;
    }
    Object.assign(settings.security.antiSpam, { enabled, maxMessages, intervalSeconds, timeoutMinutes });
  } else if (key === 'antiRaid') {
    const enabled = enabledValue(modalValue(interaction, 'enabled'));
    const joinThreshold = boundedInteger(modalValue(interaction, 'threshold'), 3, 30);
    const intervalSeconds = boundedInteger(modalValue(interaction, 'interval'), 5, 120);
    const protectionMinutes = boundedInteger(modalValue(interaction, 'duration'), 1, 60);
    if (enabled === null || joinThreshold === null || intervalSeconds === null || protectionMinutes === null) {
      await interaction.reply({ content: 'Valeurs anti-raid invalides. Vérifiez les plages indiquées dans chaque champ.', ephemeral: true });
      return true;
    }
    Object.assign(settings.security.antiRaid, { enabled, joinThreshold, intervalSeconds, protectionMinutes });
  } else if (key === 'welcome' || key === 'leave') {
    const enabled = enabledValue(modalValue(interaction, 'enabled'));
    const message = modalValue(interaction, 'message');
    const ping = key === 'welcome' ? enabledValue(modalValue(interaction, 'ping')) : false;
    if (enabled === null || !message || (key === 'welcome' && ping === null)) {
      await interaction.reply({ content: 'Valeurs invalides. Vérifiez le texte et utilisez `on` ou `off` pour les options.', ephemeral: true });
      return true;
    }
    Object.assign(settings[key], { enabled, message });
    if (key === 'welcome') settings.welcome.ping = ping;
  } else {
    await interaction.reply({ content: 'Cette action de configuration n’est pas reconnue.', ephemeral: true });
    return true;
  }

  await save();
  await interaction.reply({
    content: 'Configuration enregistrée. Revenez au panneau privé et choisissez la rubrique concernée pour afficher les nouvelles valeurs.',
    ephemeral: true,
  });
  return true;
}
