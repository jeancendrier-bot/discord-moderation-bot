import { ChannelType, EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { getGuild, removeMemberEventImage, save, saveMemberEventImage } from './store.js';

const reason = (o) => o.setName('reason').setDescription('Motif communiqué au membre et consigné dans le journal').setMaxLength(400);
const user = (o) => o.setName('user').setDescription('Membre visé par cette action').setRequired(true);

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
  new SlashCommandBuilder().setName('nickname').setDescription('Définir ou réinitialiser le pseudonyme d’un membre').setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
    .addUserOption(user).addStringOption((o) => o.setName('nickname').setDescription('Nouveau pseudonyme ; laisser vide pour rétablir celui d’origine').setMaxLength(32)).addStringOption(reason),
  new SlashCommandBuilder().setName('modlog').setDescription('Définir le salon du journal de modération ou désactiver celui-ci').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((o) => o.setName('channel').setDescription('Salon de destination ; ne pas renseigner pour désactiver le journal').addChannelTypes(ChannelType.GuildText)),
  new SlashCommandBuilder().setName('logs').setDescription('Configurer le journal de modération ou consulter les dernières entrées').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((o) => o.setName('salon').setDescription('Définir le salon de destination des journaux')
      .addChannelOption((option) => option.setName('channel').setDescription('Salon où publier les journaux').addChannelTypes(ChannelType.GuildText).setRequired(true)))
    .addSubcommand((o) => o.setName('afficher').setDescription('Consulter les dix dernières entrées du journal')),
  ...[
    ['bienvenue', 'welcome', 'Configurer l’annonce affichée lors de l’arrivée d’un membre', 'Bienvenue {user} sur {server} !'],
    ['depart', 'leave', 'Configurer l’annonce affichée lorsqu’un membre quitte le serveur', '{username} a quitté {server}.'],
  ].map(([commandName, event, description]) => new SlashCommandBuilder()
    .setName(commandName)
    .setDescription(description)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((o) => o.setName('afficher').setDescription('Consulter les paramètres actuels de l’annonce'))
    .addSubcommand((o) => o.setName('configurer').setDescription('Définir le salon, le texte et l’image de l’annonce')
      .addBooleanOption((option) => option.setName('actif').setDescription('Activer ou désactiver cette annonce').setRequired(true))
      .addChannelOption((option) => option.setName('salon').setDescription('Salon où publier l’annonce').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addStringOption((option) => option.setName('texte').setDescription(`Texte de l’annonce (${event === 'welcome' ? '{user}' : '{username}'}, {server}, {memberCount})`).setMaxLength(1000))
      .addAttachmentOption((option) => option.setName('image').setDescription('Image personnalisée (PNG, JPEG, GIF ou WebP, 8 Mo maximum)'))
      .addBooleanOption((option) => option.setName('effacer_image').setDescription('Supprimer l’image personnalisée actuelle')))),
  new SlashCommandBuilder().setName('config').setDescription('Gérer la langue et les protections automatiques du serveur').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
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
      .addIntegerOption((option) => option.setName('duree').setDescription('Durée du niveau de vérification renforcé, en minutes').setMinValue(1).setMaxValue(60).setRequired(true))),
  new SlashCommandBuilder().setName('ticket').setDescription('Gérer les demandes d’assistance dans des salons privés')
    .addSubcommand((o) => o.setName('setup').setDescription('Définir la catégorie et le rôle de l’équipe de support')
      .addChannelOption((option) => option.setName('category').setDescription('Catégorie dans laquelle créer les tickets').addChannelTypes(ChannelType.GuildCategory).setRequired(true))
      .addRoleOption((option) => option.setName('support_role').setDescription('Rôle de l’équipe autorisé à accéder aux tickets')))
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
  eventSettings.enabled = interaction.options.getBoolean('actif', true);
  eventSettings.channelId = interaction.options.getChannel('salon', true).id;
  eventSettings.message = interaction.options.getString('texte') ?? eventSettings.message;
  eventSettings.imagePath = imagePath;
  await save();
  if ((attachment || clearImage) && previousImage && previousImage !== imagePath) {
    await removeMemberEventImage(previousImage);
  }

  const imageStatus = imagePath ? 'L’image personnalisée est enregistrée.' : 'Aucune image personnalisée n’est définie.';
  await interaction.editReply({
    content: `L’annonce de ${eventName} a été ${eventSettings.enabled ? 'activée' : 'désactivée'} dans <#${eventSettings.channelId}>. ${imageStatus}`,
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
        commands: ['purge', 'slowmode', 'lock', 'unlock', 'nickname', 'modlog', 'logs'],
      },
      {
        name: 'Configuration et assistance',
        permission: 'Gérer le serveur pour la configuration ; les tickets dépendent de leur configuration.',
        commands: ['config', 'ticket', 'bienvenue', 'depart'],
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
  const why = interaction.options.getString('reason') || 'Aucun motif n’a été communiqué.';

  if (name === 'bienvenue' || name === 'depart') {
    await handleMemberEventSettings(interaction, settings, name === 'bienvenue' ? 'welcome' : 'leave');
    return;
  }

  if (name === 'logs') {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'salon') {
      const channel = interaction.options.getChannel('channel', true);
      settings.logChannelId = channel.id;
      await save();
      await interaction.reply({ content: `Le journal de modération sera désormais publié dans <#${channel.id}>.`, ephemeral: true });
      return;
    }

    if (!settings.logChannelId) {
      await interaction.reply({ content: 'Aucun salon de journal n’est configuré. Utilisez `/logs salon` pour en choisir un.', ephemeral: true });
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

  if (name === 'config') {
    const subcommand = interaction.options.getSubcommand();
    const security = settings.security;
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

  if (name === 'modlog') {
    const channel = interaction.options.getChannel('channel');
    settings.logChannelId = channel ? channel.id : null;
    await save();
    await interaction.reply({ content: channel ? `Le journal de modération sera désormais publié dans <#${channel.id}>.` : 'Le journal de modération a été désactivé.', ephemeral: true });
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
    if (subcommand === 'setup') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ content: 'La permission « Gérer le serveur » est requise pour modifier la configuration des tickets.', ephemeral: true });
        return;
      }
      settings.ticketCategoryId = interaction.options.getChannel('category', true).id;
      settings.ticketSupportRoleId = interaction.options.getRole('support_role')?.id ?? null;
      await save();
      await interaction.reply({ content: 'La configuration des tickets a été enregistrée avec succès.', ephemeral: true });
      return;
    }

    if (subcommand === 'create') {
      await interaction.deferReply({ ephemeral: true });
      let category = null;
      if (settings.ticketCategoryId) {
        try {
          category = await interaction.guild.channels.fetch(settings.ticketCategoryId);
        } catch (error) {
          if (Number(error.code) !== 10003) throw error;
        }
      }
      if (!category || category.type !== ChannelType.GuildCategory) {
        await interaction.editReply({ content: 'Le système de tickets n’est pas encore configuré. Un administrateur doit d’abord utiliser `/ticket setup`.' });
        return;
      }
      const existing = interaction.guild.channels.cache.find((channel) => ticketOwner(channel) === interaction.user.id);
      if (existing) {
        await interaction.editReply({ content: `Un ticket est déjà ouvert pour vous : <#${existing.id}>.` });
        return;
      }
      const slug = interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'member';
      const overwrites = [
        { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
        { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] },
      ];
      if (settings.ticketSupportRoleId) {
        overwrites.push({ id: settings.ticketSupportRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
      }
      const channel = await interaction.guild.channels.create({
        name: `ticket-${slug}`,
        type: ChannelType.GuildText,
        parent: category.id,
        topic: `ticket-owner:${interaction.user.id}`,
        permissionOverwrites: overwrites,
      });
      await channel.send({ content: `<@${interaction.user.id}> Votre demande a bien été enregistrée. L’équipe de support vous répondra dans ce salon. Pour clôturer le ticket, utilisez /ticket close.`, allowedMentions: { users: [interaction.user.id] } });
      await interaction.editReply({ content: `Votre demande a été créée. Vous pouvez la consulter dans <#${channel.id}>.` });
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
      const participants = channel.permissionOverwrites.cache.filter((overwrite) =>
        overwrite.id !== interaction.guild.id
        && overwrite.id !== interaction.client.user.id
        && overwrite.id !== settings.ticketSupportRoleId,
      );
      await Promise.all(participants.map((overwrite) => overwrite.edit({ SendMessages: false })));
      await channel.setTopic(`ticket-closed:${ownerId}`);
      await channel.setName(`closed-${channel.name.replace(/^ticket-/, '').slice(0, 90)}`);
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
    await interaction.guild.members.unban(id, why);
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
    await member.setNickname(nickname, why);
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
    await interaction.deferReply();
    await member.kick(why);
    await tell(target, interaction.guild, `Vous avez été exclu du serveur.\nMotif : ${why}`);
    await interaction.editReply({ content: `${target.tag} a été exclu du serveur. Motif : ${why}`, allowedMentions: { parse: [] } });
    await log(interaction, settings, 'kick', target, why);
    return;
  }

  if (name === 'ban') {
    const days = interaction.options.getInteger('delete_days') ?? 0;
    await interaction.deferReply();
    await interaction.guild.members.ban(target.id, { reason: why, deleteMessageSeconds: days * 24 * 3600 });
    await tell(target, interaction.guild, `Vous avez été banni du serveur.\nMotif : ${why}`);
    await interaction.editReply({ content: `${target.tag} a été banni du serveur. Motif : ${why}`, allowedMentions: { parse: [] } });
    await log(interaction, settings, 'ban', target, why);
  }
}
