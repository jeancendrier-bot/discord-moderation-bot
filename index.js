import { Client, GatewayIntentBits, Events, REST, Routes } from 'discord.js';
import { commands, handleCommand, handleConfigInteraction, handleTicketInteraction } from './src/commands.js';
import { handleGuildMemberAdd, handleMessageCreate, restoreRaidProtection } from './src/security.js';
import { handleGuildJoined, handleMemberEvent } from './src/member-events.js';

const token = (process.env.DISCORD_TOKEN || '').trim();
if (!token) {
  console.error('[moderation-bot] DISCORD_TOKEN est manquant. Ajoutez le jeton du bot dans les variables d’environnement de votre hébergeur.');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildModeration, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
const knownGuilds = new Set();

client.once(Events.ClientReady, async (c) => {
  console.log(`[moderation-bot] Connecté sous ${c.user.tag} sur ${c.guilds.cache.size} serveur(s).`);
  for (const guildId of c.guilds.cache.keys()) knownGuilds.add(guildId);
  c.user.setActivity('la sécurité du serveur', { type: 3 });
  await restoreRaidProtection(c).catch((err) => console.error('[moderation-bot] Restauration anti-raid impossible :', err.message));
  try {
    await new REST().setToken(token).put(Routes.applicationCommands(c.user.id), { body: commands });
    console.log(`[moderation-bot] ${commands.length} commandes slash globales enregistrées : ${commands.map(({ name }) => `/${name}`).join(', ')}. Leur propagation peut prendre jusqu’à une heure.`);
  } catch (err) {
    console.error(`[moderation-bot] Échec de l’enregistrement global des commandes (code ${err.code ?? 'inconnu'}) : ${err.message}`);
    console.error('[moderation-bot] Vérifiez l’identifiant d’application, le jeton DISCORD_TOKEN et la portée applications.commands.');
  }
});

client.on(Events.GuildCreate, (guild) => {
  if (!client.isReady() || knownGuilds.has(guild.id)) return;
  knownGuilds.add(guild.id);
  handleGuildJoined(guild).catch((err) => console.error('[moderation-bot] Message de bienvenue du bot impossible :', err));
});

client.on(Events.GuildDelete, (guild) => {
  knownGuilds.delete(guild.id);
});

client.on(Events.MessageCreate, (message) => {
  handleMessageCreate(message).catch((err) => console.error('[moderation-bot] Filtre de messages en échec :', err));
});

client.on(Events.GuildMemberAdd, (member) => {
  handleGuildMemberAdd(member).catch((err) => console.error('[moderation-bot] Protection anti-raid en échec :', err));
  handleMemberEvent(member, 'welcome').catch((err) => console.error('[moderation-bot] Annonce de bienvenue impossible :', err));
});

client.on(Events.GuildMemberRemove, (member) => {
  handleMemberEvent(member, 'leave').catch((err) => console.error('[moderation-bot] Annonce de départ impossible :', err));
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isButton() || interaction.isModalSubmit()) {
      if (await handleTicketInteraction(interaction)) return;
      await handleConfigInteraction(interaction);
      return;
    }
    if (!interaction.isChatInputCommand()) return;
    if (!interaction.inGuild()) {
      await interaction.reply({ content: 'Ces commandes sont disponibles uniquement sur un serveur Discord.', ephemeral: true });
      return;
    }
    await handleCommand(interaction);
  } catch (err) {
    console.error('[moderation-bot] Échec de l’interaction :', err);
    const messages = {
      50001: 'Le bot ne dispose pas de l’accès nécessaire à cette ressource.',
      50013: 'Le bot ne dispose pas des permissions nécessaires. Vérifiez ses permissions et la position de son rôle.',
      10003: 'Ce salon n’existe plus ou n’est pas accessible au bot.',
      10007: 'Ce membre ne fait plus partie du serveur.',
      10026: 'Aucun bannissement actif ne correspond à cet identifiant.',
    };
    const text = messages[err.code] || 'L’action n’a pas pu être exécutée. Vérifiez les permissions du bot, la hiérarchie des rôles et les paramètres fournis, puis réessayez.';
    if (interaction.deferred) await interaction.editReply({ content: text }).catch(() => {});
    else if (!interaction.replied) await interaction.reply({ content: text, ephemeral: true }).catch(() => {});
  }
});

client.login(token).catch((error) => {
  if (String(error.code) === 'TokenInvalid' || String(error).includes('TOKEN_INVALID')) {
    console.error('[moderation-bot] Discord a refusé DISCORD_TOKEN. Réinitialisez le jeton dans le portail développeur Discord, mettez à jour la variable d’environnement et redémarrez le bot.');
  } else if (String(error.code) === 'DisallowedIntents' || String(error).includes('disallowed intents')) {
    console.error('[moderation-bot] Discord a refusé une intention privilégiée. Activez SERVER MEMBERS INTENT et MESSAGE CONTENT INTENT dans les paramètres du bot, puis redémarrez-le.');
  } else {
    console.error(`[moderation-bot] Connexion à Discord impossible : ${error.message}`);
  }
  process.exit(1);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    client.destroy();
    process.exit(0);
  });
}
