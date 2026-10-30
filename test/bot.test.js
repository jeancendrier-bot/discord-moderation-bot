import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { Collection, GuildVerificationLevel } from 'discord.js';

let dataDirectory;
let getGuild;
let save;
let saveMemberEventImage;
let removeMemberEventImage;
let commands;
let handleCommand;
let handleConfigInteraction;
let handleTicketInteraction;
let security;

before(async () => {
  dataDirectory = await mkdtemp(join(tmpdir(), 'moderation-bot-test-'));
  process.env.CONFIG_PATH = join(dataDirectory, 'config.json');
  ({ getGuild, removeMemberEventImage, save, saveMemberEventImage } = await import('../src/store.js'));
  ({ commands, handleCommand, handleConfigInteraction, handleTicketInteraction } = await import('../src/commands.js'));
  security = await import('../src/security.js');
});

after(async () => {
  await rm(dataDirectory, { recursive: true, force: true });
});

describe('slash command definitions', () => {
  it('serialize unique commands with valid Discord descriptions', async () => {
    const names = commands.map((command) => command.name);
    assert.equal(names.length, 19);
    assert.equal(new Set(names).size, names.length);

    const inspect = (option, path) => {
      assert.ok(option.name, `${path} has a name`);
      assert.ok(option.description, `${path} has a description`);
      assert.ok(option.description.length <= 100, `${path} description is within Discord limits`);
      for (const child of option.options ?? []) inspect(child, `${path}/${child.name}`);
    };

    for (const command of commands) inspect(command, `/${command.name}`);
    const config = commands.find((command) => command.name === 'config');
    assert.deepEqual(config.options.map((option) => option.name), ['panneau', 'afficher', 'langue', 'antilien', 'antispam', 'antiraid', 'bienvenue', 'depart']);
    assert.deepEqual(commands.find((command) => command.name === 'unban').options.map((option) => option.name), ['retirer', 'liste']);
    assert.ok(commands.some((command) => command.name === 'logs'));
    assert.deepEqual(commands.find((command) => command.name === 'logs').options.map((option) => option.name), ['afficher']);
    assert.ok(commands.some((command) => command.name === 'dire'));
    assert.deepEqual(commands.find((command) => command.name === 'ticket').options.map((option) => option.name), ['panel', 'create', 'close', 'add', 'remove']);
    assert.ok(config.options.find((option) => option.name === 'bienvenue').options.some((option) => option.name === 'ping'));
    assert.ok(!config.options.find((option) => option.name === 'depart').options.some((option) => option.name === 'ping'));
    const helpInteraction = { commandName: 'aide', reply: async (message) => { helpInteraction.response = message; } };
    await handleCommand(helpInteraction);
    for (const field of helpInteraction.response.embeds[0].data.fields) {
      assert.ok(field.name.length <= 256, 'help field names fit Discord embed limits');
      assert.ok(field.value.length <= 1024, 'help field values fit Discord embed limits');
    }
  });

  it('defines an administrator-only voice join and leave command', () => {
    const voice = commands.find((command) => command.name === 'vocal');
    assert.ok(voice);
    assert.equal(voice.default_member_permissions, '32');
    assert.deepEqual(voice.options.map((option) => option.name), ['rejoindre', 'quitter']);
    assert.equal(voice.options[0].options[0].name, 'salon');
  });
});

describe('configuration store', () => {
  it('loads guild defaults and persists concurrent updates in order', async () => {
    const guildIds = ['123456789012345671', '123456789012345672'];
    const [first, second] = await Promise.all(guildIds.map((id) => getGuild(id)));
    assert.equal(first.security.language, 'fr');
    assert.equal(first.security.antiSpam.maxMessages, 5);
    assert.equal(second.security.antiLink.mode, 'invites');
    assert.equal(first.welcome.enabled, false);
    assert.equal(first.welcome.ping, true);
    assert.equal(first.leave.message, '{username} a quitté {server}.');

    first.security.language = 'fr';
    const firstSave = save();
    first.security.language = 'en';
    const secondSave = save();
    await Promise.all([firstSave, secondSave]);

    const persisted = JSON.parse(await readFile(process.env.CONFIG_PATH, 'utf8'));
    assert.equal(persisted.guilds[guildIds[0]].security.language, 'en');
    assert.ok(persisted.guilds[guildIds[1]]);
  });
});

describe('moderation commands', () => {
  it('shows help without creating a guild configuration', async () => {
    let replied;
    const interaction = {
      commandName: 'aide',
      reply: async (message) => { replied = message; },
    };

    await handleCommand(interaction);
    assert.equal(replied.ephemeral, true);
    assert.match(replied.embeds[0].data.title, /commandes/i);
    assert.match(replied.embeds[0].data.fields.map((field) => field.value).join('\n'), /\/config/);
    const persisted = JSON.parse(await readFile(process.env.CONFIG_PATH, 'utf8'));
    assert.equal(persisted.guilds['123456789012345677'], undefined);
  });

  describe('interactive configuration panel', () => {
    it('displays the current settings privately', async () => {
      const interaction = {
        commandName: 'config',
        guildId: '123456789012345690',
        options: { getSubcommand: () => 'panneau' },
        reply: async (response) => { interaction.response = response; },
      };

      await handleCommand(interaction);
      assert.equal(interaction.response.ephemeral, true);
      assert.equal(interaction.response.embeds[0].data.title, 'Centre de configuration');
      assert.equal(interaction.response.components[0].components[0].data.custom_id, 'config:page');
      assert.deepEqual(
        interaction.response.components[0].components[0].options.map((option) => option.data.value),
        ['overview', 'security', 'logs', 'welcome', 'leave', 'tickets'],
      );
      assert.deepEqual(
        interaction.response.components[1].components.map((button) => button.data.custom_id),
        ['config:refresh:overview'],
      );
    });

    it('switches configuration sections and exposes ticket selectors', async () => {
      const interaction = {
        isButton: () => false,
        isModalSubmit: () => false,
        isStringSelectMenu: () => true,
        isChannelSelectMenu: () => false,
        isRoleSelectMenu: () => false,
        customId: 'config:page',
        values: ['tickets'],
        inGuild: () => true,
        memberPermissions: { has: () => true },
        guildId: '123456789012345693',
        update: async (response) => { interaction.response = response; },
        reply: async (response) => { interaction.response = response; },
      };

      assert.equal(await handleConfigInteraction(interaction), true);
      assert.match(interaction.response.embeds[0].data.description, /Définissez la catégorie et le rôle du support/);
      assert.deepEqual(
        interaction.response.components.map((row) => row.components[0].data.custom_id),
        ['config:page', 'config:channel:ticketCategory', 'config:role:ticketSupport', 'config:clear:ticketRole'],
      );
    });

    it('opens the selected modal and persists validated values', async () => {
      const guildId = '123456789012345691';
      const button = {
        isButton: () => true,
        isModalSubmit: () => false,
        isStringSelectMenu: () => false,
        isChannelSelectMenu: () => false,
        isRoleSelectMenu: () => false,
        customId: 'config:antiSpam',
        inGuild: () => true,
        memberPermissions: { has: () => true },
        guildId,
        showModal: async (modal) => { button.modal = modal; },
      };
      assert.equal(await handleConfigInteraction(button), true);
      assert.equal(button.modal.data.custom_id, 'config:save:antiSpam');

      const values = { enabled: 'on', maximum: '7', interval: '12', timeout: '4' };
      const modal = {
        isButton: () => false,
        isModalSubmit: () => true,
        customId: 'config:save:antiSpam',
        inGuild: () => true,
        memberPermissions: { has: () => true },
        guildId,
        fields: { getTextInputValue: (key) => values[key] },
        reply: async (response) => { modal.response = response; },
      };
      assert.equal(await handleConfigInteraction(modal), true);
      assert.match(modal.response.content, /Configuration enregistrée/);
      const persisted = JSON.parse(await readFile(process.env.CONFIG_PATH, 'utf8'));
      assert.deepEqual(persisted.guilds[guildId].security.antiSpam, {
        enabled: true,
        maxMessages: 7,
        intervalSeconds: 12,
        timeoutMinutes: 4,
      });
    });

    it('rejects configuration changes from members without Manage Server', async () => {
      const interaction = {
        isButton: () => true,
        isModalSubmit: () => false,
        isStringSelectMenu: () => false,
        isChannelSelectMenu: () => false,
        isRoleSelectMenu: () => false,
        customId: 'config:refresh',
        inGuild: () => true,
        memberPermissions: { has: () => false },
        reply: async (response) => { interaction.response = response; },
      };
      assert.equal(await handleConfigInteraction(interaction), true);
      assert.match(interaction.response.content, /Gérer le serveur/);
      assert.equal(interaction.response.ephemeral, true);
    });
  });

  it('acknowledges a timeout before making the Discord API request', async () => {
    const target = {
      id: '666666666666666666',
      tag: 'member#0001',
      send: async () => {},
    };
    const targetMember = {
      id: target.id,
      roles: { highest: { position: 1 } },
      timeout: async () => {
        assert.equal(interaction.deferred, true);
      },
    };
    const moderator = { roles: { highest: { position: 5 } } };
    const guild = {
      id: '123456789012345676',
      ownerId: '777777777777777777',
      members: {
        me: { roles: { highest: { position: 10 } } },
        fetch: async (id) => id === target.id ? targetMember : moderator,
      },
    };
    const response = [];
    const interaction = {
      commandName: 'timeout',
      guildId: guild.id,
      guild,
      user: { id: '888888888888888888' },
      options: {
        getString: (name) => name === 'reason' ? 'Raison de test' : null,
        getUser: () => target,
        getInteger: () => 5,
      },
      deferred: false,
      deferReply: async () => { interaction.deferred = true; },
      editReply: async (message) => response.push(message),
      reply: async (message) => response.push(message),
    };

    await handleCommand(interaction);
    assert.equal(response.length, 1);
    assert.match(response[0].content, /5 minute/);
    assert.deepEqual(response[0].allowedMentions, { parse: [] });
  });

  it('configures the moderation log channel from the central panel and displays its entries', async () => {
    const guildId = '123456789012345680';
    const settings = await getGuild(guildId);
    const channel = { id: '987654321098765434', name: 'mod-logs', type: 0 };
    const configuredInteraction = {
      isButton: () => false,
      isModalSubmit: () => false,
      isStringSelectMenu: () => false,
      isChannelSelectMenu: () => true,
      isRoleSelectMenu: () => false,
      customId: 'config:channel:logs',
      values: [channel.id],
      inGuild: () => true,
      memberPermissions: { has: () => true },
      guildId,
      guild: { channels: { cache: new Collection([[channel.id, channel]]) } },
      update: async (message) => { configuredInteraction.response = message; },
      reply: async (message) => { configuredInteraction.response = message; },
    };
    await handleConfigInteraction(configuredInteraction);
    assert.equal(settings.logChannelId, channel.id);

    const logMessage = {
      author: { id: 'bot-user' },
      content: 'Action de modération',
      embeds: [],
      createdTimestamp: Date.now(),
    };
    const logChannel = {
      id: channel.id,
      name: channel.name,
      isTextBased: () => true,
      messages: { fetch: async () => new Collection([['log-message', logMessage]]) },
    };
    const displayInteraction = {
      commandName: 'logs',
      guildId,
      client: { user: { id: 'bot-user' } },
      guild: { channels: { fetch: async () => logChannel } },
      options: { getString: () => null, getSubcommand: () => 'afficher' },
      deferReply: async () => {},
      editReply: async (message) => { displayInteraction.response = message; },
    };
    await handleCommand(displayInteraction);
    assert.match(displayInteraction.response.embeds[0].data.description, /Action de modération/);
  });

  it('lists banned accounts through the unban command', async () => {
    const bannedUser = { id: '999999999999999999', username: 'BannedUser' };
    const interaction = {
      commandName: 'unban',
      guildId: '123456789012345681',
      guild: { bans: { fetch: async () => new Collection([[bannedUser.id, { user: bannedUser, reason: 'Test' }]]) } },
      options: { getString: () => null, getSubcommand: () => 'liste', getInteger: () => 1 },
      deferReply: async () => {},
      editReply: async (message) => { interaction.response = message; },
    };

    await handleCommand(interaction);
    assert.match(interaction.response.embeds[0].data.description, /BannedUser/);
    assert.match(interaction.response.embeds[0].data.description, /Test/);
  });

  it('saves the welcome ping option', async () => {
    const guildId = '123456789012345684';
    const channel = { id: '987654321098765435' };
    const interaction = {
      commandName: 'config',
      guildId,
      options: {
        getSubcommand: () => 'bienvenue',
        getAttachment: () => null,
        getBoolean: (name) => ({ actif: true, effacer_image: false, ping: false })[name] ?? null,
        getChannel: () => channel,
        getString: () => null,
      },
      deferReply: async () => {},
      editReply: async (message) => { interaction.response = message; },
    };

    await handleCommand(interaction);
    assert.equal((await getGuild(guildId)).welcome.ping, false);
    assert.match(interaction.response.content, /mention.*désactivée/i);
  });

  it('publishes bot messages without triggering user or role mentions', async () => {
    let sent;
    const channel = {
      id: '987654321098765437',
      isTextBased: () => true,
      send: async (message) => { sent = message; },
    };
    const interaction = {
      commandName: 'dire',
      guildId: '123456789012345686',
      channel,
      options: {
        getString: () => '@everyone regardez <@123456789012345678>',
        getChannel: () => null,
      },
      deferReply: async () => {},
      editReply: async (message) => { interaction.response = message; },
    };

    await handleCommand(interaction);
    assert.equal(sent.content, '@everyone regardez <@123456789012345678>');
    assert.deepEqual(sent.allowedMentions, { parse: [] });
    assert.match(interaction.response.content, /aucune notification/);
  });

  it('removes a ban by user ID and records the reason', async () => {
    let unbanned;
    const interaction = {
      commandName: 'unban',
      guildId: '123456789012345683',
      options: {
        getString: (name) => name === 'user_id' ? '999999999999999998' : 'Test reason',
        getSubcommand: () => 'retirer',
      },
      deferReply: async () => {},
      editReply: async (message) => { interaction.response = message; },
      guild: {
        bans: { fetch: async () => new Collection() },
        members: { unban: async (...args) => { unbanned = args; } },
      },
    };

    await handleCommand(interaction);
    assert.equal(unbanned[0], '999999999999999998');
    assert.equal(unbanned[1], 'Test reason');
    assert.match(interaction.response.content, /a été levé/);
  });

  it('publishes a ticket panel with a persistent open-ticket button', async () => {
    const guildId = '123456789012345687';
    const settings = await getGuild(guildId);
    settings.ticketCategoryId = '777777777777777778';
    await save();
    let panel;
    const channel = {
      id: '987654321098765438',
      send: async (message) => { panel = message; },
    };
    const interaction = {
      commandName: 'ticket',
      guildId,
      guild: { channels: { fetch: async () => ({ id: settings.ticketCategoryId, type: 4 }) } },
      memberPermissions: { has: () => true },
      options: {
        getSubcommand: () => 'panel',
        getChannel: () => channel,
        getString: (name) => ({ titre: 'Contacter le support', description: 'Expliquez votre demande.' })[name] ?? null,
      },
      deferReply: async () => {},
      editReply: async (message) => { interaction.response = message; },
    };

    await handleCommand(interaction);
    assert.equal(panel.embeds[0].data.title, 'Contacter le support');
    assert.equal(panel.embeds[0].data.description, 'Expliquez votre demande.');
    assert.equal(panel.components[0].components[0].data.custom_id, 'ticket:open');
    assert.match(interaction.response.content, /panneau.*publié/i);
  });

  it('opens the ticket request modal from the panel button', async () => {
    let modal;
    const interaction = {
      customId: 'ticket:open',
      inGuild: () => true,
      isButton: () => true,
      isModalSubmit: () => false,
      showModal: async (value) => { modal = value; },
    };

    assert.equal(await handleTicketInteraction(interaction), true);
    assert.equal(modal.data.custom_id, 'ticket:create');
    assert.deepEqual(modal.components.map((row) => row.components[0].data.custom_id), ['subject', 'details']);
  });

  it('creates a private ticket from the submitted form', async () => {
    const guildId = '123456789012345688';
    const settings = await getGuild(guildId);
    settings.ticketCategoryId = '777777777777777779';
    settings.ticketSupportRoleId = '777777777777777780';
    await save();

    let channelPayload;
    let ticketMessage;
    const channels = new Collection();
    const category = { id: settings.ticketCategoryId, type: 4 };
    const guild = {
      id: guildId,
      channels: {
        cache: channels,
        fetch: async () => category,
        create: async (payload) => {
          channelPayload = payload;
          const created = {
            id: '987654321098765439',
            send: async (message) => { ticketMessage = message; },
          };
          channels.set(created.id, created);
          return created;
        },
      },
    };
    const user = { id: '555555555555555556', username: 'ticket-user' };
    const client = { user: { id: '999999999999999991' } };
    const interaction = {
      customId: 'ticket:create',
      guildId,
      guild,
      user,
      client,
      inGuild: () => true,
      isButton: () => false,
      isModalSubmit: () => true,
      isStringSelectMenu: () => false,
      isChannelSelectMenu: () => false,
      isRoleSelectMenu: () => false,
      fields: { getTextInputValue: (name) => ({ subject: 'Connexion au bot', details: 'Je ne parviens pas à utiliser une commande.' })[name] },
      deferReply: async () => {},
      editReply: async (message) => { interaction.response = message; },
    };

    assert.equal(await handleTicketInteraction(interaction), true);
    assert.equal(channelPayload.parent, category.id);
    assert.equal(channelPayload.topic, `ticket-owner:${user.id}`);
    assert.ok(channelPayload.permissionOverwrites.some((overwrite) => overwrite.id === user.id));
    assert.ok(channelPayload.permissionOverwrites.some((overwrite) => overwrite.id === settings.ticketSupportRoleId));
    assert.equal(ticketMessage.embeds[0].data.title, 'Connexion au bot');
    assert.equal(ticketMessage.embeds[0].data.description, 'Je ne parviens pas à utiliser une commande.');
    assert.equal(ticketMessage.components[0].components[0].data.custom_id, 'ticket:close');
    assert.deepEqual(ticketMessage.allowedMentions, { users: [user.id] });
    assert.match(interaction.response.content, /ticket a été créé/i);
  });

  it('lets only the ticket owner or configured support team close it from its button', async () => {
    const guildId = '123456789012345689';
    const ownerId = '555555555555555557';
    await getGuild(guildId);
    let updatedTopic;
    let updatedName;
    let disabledComponents;
    const channel = {
      id: '987654321098765440',
      name: 'ticket-ticket-user',
      topic: `ticket-owner:${ownerId}`,
      guild: { id: guildId },
      client: { user: { id: '999999999999999992' } },
      permissionOverwrites: {
        cache: new Collection(),
      },
      setTopic: async (value) => { updatedTopic = value; },
      setName: async (value) => { updatedName = value; },
    };
    const interaction = {
      customId: 'ticket:close',
      guildId,
      guild: channel.guild,
      channel,
      user: { id: ownerId },
      inGuild: () => true,
      isButton: () => true,
      isModalSubmit: () => false,
      deferReply: async () => {},
      message: { edit: async (message) => { disabledComponents = message.components; } },
      editReply: async (message) => { interaction.response = message; },
    };

    assert.equal(await handleTicketInteraction(interaction), true);
    assert.equal(updatedTopic, `ticket-closed:${ownerId}`);
    assert.equal(updatedName, 'closed-ticket-user');
    assert.equal(disabledComponents[0].components[0].data.disabled, true);
    assert.match(interaction.response.content, /ticket a été clôturé/i);
  });
});

describe('persisted announcement images', () => {
  it('accepts supported Discord CDN images and rejects arbitrary hosts', async () => {
    const originalFetch = globalThis.fetch;
    const bytes = Buffer.from('89504e470d0a1a0a', 'hex');
    let downloaded;
    globalThis.fetch = async (url) => {
      downloaded = String(url);
      return new Response(bytes, { headers: { 'content-type': 'image/png' } });
    };
    try {
      const guildId = '123456789012345682';
      const imagePath = await saveMemberEventImage(guildId, 'welcome', {
        url: 'https://cdn.discordapp.com/attachments/1/2/welcome.png',
        contentType: 'image/png',
        size: bytes.length,
      });
      assert.match(downloaded, /^https:\/\/cdn\.discordapp\.com\//);
      assert.deepEqual(await readFile(imagePath), bytes);
      await removeMemberEventImage(imagePath);
      await assert.rejects(saveMemberEventImage(guildId, 'welcome', {
        url: 'https://example.com/image.png',
        contentType: 'image/png',
        size: bytes.length,
      }), /CDN sécurisé de Discord/);
      await assert.rejects(saveMemberEventImage(guildId, 'welcome', {
        url: 'https://cdn.discordapp.com/attachments/1/2/large.png',
        contentType: 'image/png',
        size: 9 * 1024 * 1024,
      }), /8 Mo maximum/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('member arrival and departure announcements', () => {
  it('thanks the server owner when the bot joins and prefers the system channel', async () => {
    const { handleGuildJoined } = await import('../src/member-events.js');
    let sent;
    const systemChannel = {
      id: '987654321098765430',
      name: 'general',
      isTextBased: () => true,
      permissionsFor: () => ({ has: () => true }),
      send: async (message) => { sent = message; },
    };
    const guild = {
      id: '123456789012345692',
      name: 'Test server',
      client: { user: { username: 'Moderation Bot' } },
      members: { me: {} },
      systemChannel,
      channels: { cache: new Collection([[systemChannel.id, systemChannel]]) },
    };

    assert.equal(await handleGuildJoined(guild), systemChannel.id);
    assert.match(sent.content, /Merci d’avoir ajouté \*\*Moderation Bot\*\*/);
    assert.match(sent.content, /`\/config panneau`/);
    assert.deepEqual(sent.allowedMentions, { parse: [] });
  });

  it('sends a configured welcome embed with its stored image and only mentions the new member', async () => {
    const { handleMemberEvent } = await import('../src/member-events.js');
    const guildId = '123456789012345679';
    const settings = await getGuild(guildId);
    settings.welcome.enabled = true;
    settings.welcome.channelId = '987654321098765433';
    settings.welcome.message = 'Bienvenue sur {server} !';
    settings.welcome.imagePath = '/tmp/custom-welcome.png';
    await save();

    let sent;
    const member = {
      id: '222222222222222223',
      user: { username: 'TestUser' },
      guild: {
        id: guildId,
        name: 'Test server',
        memberCount: 12,
        channels: {
          fetch: async () => ({
            isTextBased: () => true,
            send: async (message) => { sent = message; },
          }),
        },
      },
    };

    await handleMemberEvent(member, 'welcome');
    assert.equal(sent.embeds[0].data.description, `<@${member.id}> Bienvenue sur Test server !`);
    assert.deepEqual(sent.allowedMentions, { users: [member.id] });
    assert.equal(sent.files.length, 1);
    assert.equal(sent.embeds[0].data.image.url, 'attachment://welcome-image.png');
  });

  it('does not ping the arriving member when welcome mentions are disabled', async () => {
    const { handleMemberEvent } = await import('../src/member-events.js');
    const guildId = '123456789012345685';
    const settings = await getGuild(guildId);
    settings.welcome.enabled = true;
    settings.welcome.ping = false;
    settings.welcome.channelId = '987654321098765436';
    settings.welcome.message = 'Bienvenue {user} !';
    await save();

    let sent;
    const member = {
      id: '222222222222222224',
      user: { username: 'TestUser' },
      guild: {
        id: guildId,
        name: 'Test server',
        memberCount: 12,
        channels: { fetch: async () => ({ isTextBased: () => true, send: async (message) => { sent = message; } }) },
      },
    };

    await handleMemberEvent(member, 'welcome');
    assert.equal(sent.embeds[0].data.description, `Bienvenue <@${member.id}> !`);
    assert.deepEqual(sent.allowedMentions, { users: [] });
  });
});

describe('automatic protections', () => {
  it('deletes blocked Discord invitations and notifies the moderation log', async () => {
    const guildId = '123456789012345673';
    const settings = await getGuild(guildId);
    settings.security.antiLink.enabled = true;
    settings.security.antiLink.mode = 'invites';
    settings.logChannelId = '987654321098765432';
    await save();

    let deleted = 0;
    let directMessages = 0;
    const logMessages = [];
    const member = {
      permissions: { has: () => false },
      roles: { cache: new Map() },
    };
    const guild = {
      id: guildId,
      name: 'Test server',
      channels: { cache: new Map([['987654321098765432', {
        isTextBased: () => true,
        send: async (message) => logMessages.push(message),
      }]]) },
    };
    const message = {
      guild,
      guildId,
      channelId: '111111111111111111',
      content: 'Join discord.gg/example',
      author: { id: '222222222222222222', bot: false, send: async () => { directMessages += 1; } },
      member,
      inGuild: () => true,
      delete: async () => { deleted += 1; },
    };

    await security.handleMessageCreate(message);
    assert.equal(deleted, 1);
    assert.equal(directMessages, 1);
    assert.equal(logMessages.length, 1);
    assert.deepEqual(logMessages[0].allowedMentions, { parse: [] });
  });

  it('applies one anti-spam timeout for a burst and suppresses duplicate sanctions', async () => {
    const guildId = '123456789012345674';
    const settings = await getGuild(guildId);
    settings.security.antiSpam.enabled = true;
    settings.security.antiSpam.maxMessages = 3;
    settings.security.antiSpam.intervalSeconds = 8;
    settings.security.antiSpam.timeoutMinutes = 2;
    await save();

    let deleted = 0;
    let timeouts = 0;
    const member = {
      id: '333333333333333333',
      permissions: { has: () => false },
      roles: { highest: { position: 1 }, cache: new Map() },
      timeout: async () => { timeouts += 1; },
      user: { send: async () => {} },
    };
    const guild = {
      id: guildId,
      name: 'Test server',
      ownerId: '444444444444444444',
      members: { me: { roles: { highest: { position: 10 } } } },
      channels: { cache: new Map() },
    };

    const createMessage = () => ({
      guild,
      guildId,
      channelId: '555555555555555555',
      content: 'ordinary message',
      author: { id: member.id, bot: false },
      member,
      inGuild: () => true,
      delete: async () => { deleted += 1; },
    });

    await security.handleMessageCreate(createMessage());
    await security.handleMessageCreate(createMessage());
    await security.handleMessageCreate(createMessage());
    await security.handleMessageCreate(createMessage());

    assert.equal(deleted, 3);
    assert.equal(timeouts, 1);
  });

  it('raises verification after the configured join threshold', async () => {
    const guildId = '123456789012345675';
    const settings = await getGuild(guildId);
    settings.security.antiRaid.enabled = true;
    settings.security.antiRaid.joinThreshold = 3;
    settings.security.antiRaid.intervalSeconds = 15;
    settings.security.antiRaid.protectionMinutes = 10;
    await save();

    const guild = {
      id: guildId,
      verificationLevel: GuildVerificationLevel.Low,
      setVerificationLevel: async function setVerificationLevel(level) {
        this.verificationLevel = level;
      },
    };
    for (let index = 0; index < 3; index += 1) {
      await security.handleGuildMemberAdd({ guild, id: `${index + 6}`.repeat(18) });
    }

    assert.equal(guild.verificationLevel, GuildVerificationLevel.VeryHigh);
    assert.ok(settings.security.raidProtection.restoreAt > Date.now());
  });
});
