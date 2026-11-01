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
let handleHelpInteraction;
let handleTicketInteraction;
let handleVerificationInteraction;
let handleEntertainmentInteraction;
let restoreGiveaways;
let security;

before(async () => {
  dataDirectory = await mkdtemp(join(tmpdir(), 'moderation-bot-test-'));
  process.env.CONFIG_PATH = join(dataDirectory, 'config.json');
  ({ getGuild, removeMemberEventImage, save, saveMemberEventImage } = await import('../src/store.js'));
  ({ commands, handleCommand, handleConfigInteraction, handleHelpInteraction, handleTicketInteraction } = await import('../src/commands.js'));
  ({ handleVerificationInteraction } = await import('../src/verification.js'));
  ({ handleEntertainmentInteraction, restoreGiveaways } = await import('../src/entertainment.js'));
  security = await import('../src/security.js');
});

after(async () => {
  await rm(dataDirectory, { recursive: true, force: true });
});

describe('slash command definitions', () => {
  it('serialize unique commands with valid Discord descriptions', async () => {
    const names = commands.map((command) => command.name);
    assert.equal(names.length, 28);
    assert.equal(new Set(names).size, names.length);
    for (const commandName of [
      'warn', 'warnings', 'unwarn', 'clearwarnings', 'timeout', 'untimeout',
      'kick', 'ban', 'unban', 'purge', 'slowmode', 'lock', 'unlock',
      'dire', 'nickname', 'report',
    ]) {
      assert.ok(commands.some((command) => command.name === commandName), `/${commandName} remains a direct command`);
    }

    const inspect = (option, path) => {
      assert.ok(option.name, `${path} has a name`);
      assert.ok(option.description, `${path} has a description`);
      assert.ok(option.description.length <= 100, `${path} description is within Discord limits`);
      for (const child of option.options ?? []) inspect(child, `${path}/${child.name}`);
    };

    for (const command of commands) inspect(command, `/${command.name}`);
    const securitas = commands.find((command) => command.name === 'securitas');
    assert.deepEqual(securitas.options, []);
    assert.equal(securitas.default_member_permissions, '32');
    assert.deepEqual(commands.find((command) => command.name === 'gestion').options.map((option) => option.name), ['annonce', 'image', 'effacer_image']);
    assert.ok(commands.some((command) => command.name === 'verification'));
    assert.ok(commands.some((command) => command.name === 'serverinfo'));
    assert.deepEqual(commands.find((command) => command.name === 'userinfo').options.map((option) => option.name), ['user']);
    assert.equal(commands.some((command) => command.name === 'config'), false);
    assert.deepEqual(commands.find((command) => command.name === 'unban').options.map((option) => option.name), ['retirer', 'liste']);
    assert.ok(commands.some((command) => command.name === 'logs'));
    assert.deepEqual(commands.find((command) => command.name === 'logs').options.map((option) => option.name), ['afficher']);
    assert.ok(commands.some((command) => command.name === 'dire'));
    assert.deepEqual(commands.find((command) => command.name === 'tickets').options, []);
    assert.equal(commands.find((command) => command.name === 'tickets').default_member_permissions, '32');
    assert.equal(commands.some((command) => command.name === 'ticket'), false);
    assert.equal(commands.some((command) => command.name === 'panneau-admin'), false);
    assert.equal(commands.find((command) => command.name === 'giveaway').default_member_permissions, '32');
    assert.deepEqual(commands.find((command) => command.name === 'giveaway').options.map((option) => option.name), ['lot', 'duree', 'gagnants', 'salon']);
    assert.ok(commands.some((command) => command.name === 'minijeu'));
    assert.ok(commands.some((command) => command.name === 'quiz'));
    const helpInteraction = { commandName: 'aide', reply: async (message) => { helpInteraction.response = message; } };
    await handleCommand(helpInteraction);
    assert.equal(helpInteraction.response.ephemeral, true);
    assert.equal(helpInteraction.response.components[0].components[0].data.custom_id, 'help:category');
    for (const field of helpInteraction.response.embeds[0].data.fields) {
      assert.ok(field.name.length <= 256, 'help field names fit Discord embed limits');
      assert.ok(field.value.length <= 1024, 'help field values fit Discord embed limits');
    }
  });

  it('shows related commands in interactive help categories', async () => {
    const interaction = {
      isStringSelectMenu: () => true,
      customId: 'help:category',
      values: ['members'],
      update: async (response) => { interaction.response = response; },
      reply: async (response) => { interaction.response = response; },
    };
    assert.equal(await handleHelpInteraction(interaction), true);
    assert.equal(interaction.response.embeds[0].data.title, '📚 Modération des membres');
    assert.match(interaction.response.embeds[0].data.description, /\/warn/);
    assert.match(interaction.response.embeds[0].data.description, /\/ban/);
    assert.match(interaction.response.embeds[0].data.description, /\/report/);
    assert.equal(interaction.response.components[0].components[0].data.custom_id, 'help:category');

    interaction.values = ['unknown'];
    await handleHelpInteraction(interaction);
    assert.match(interaction.response.content, /catégorie de commandes n’existe pas/);
  });

  it('defines an administrator-only voice join and leave command', () => {
    const voice = commands.find((command) => command.name === 'vocal');
    assert.ok(voice);
    assert.equal(voice.default_member_permissions, '32');
    assert.deepEqual(voice.options.map((option) => option.name), ['rejoindre', 'quitter']);
    assert.equal(voice.options[0].options[0].name, 'salon');
  });

  it('rechecks moderation permissions in the handler when command access is overridden', async () => {
    let response;
    await handleCommand({
      commandName: 'ban',
      memberPermissions: { has: () => false },
      reply: async (message) => { response = message; },
    });
    assert.equal(response.ephemeral, true);
    assert.match(response.content, /permission Discord requise/);
  });

  it('provides useful server and member information commands', async () => {
    const guildId = '123456789012345649';
    const guild = {
      id: guildId,
      name: 'Serveur de test',
      memberCount: 42,
      ownerId: '111111111111111111',
      createdAt: new Date('2020-01-01T00:00:00Z'),
      iconURL: () => null,
      channels: {
        cache: new Collection([
          ['text', { type: 0 }],
          ['voice', { type: 2 }],
        ]),
      },
    };
    const serverInfo = {
      commandName: 'serverinfo',
      guildId,
      guild,
      reply: async (response) => { serverInfo.response = response; },
    };
    await handleCommand(serverInfo);
    assert.equal(serverInfo.response.embeds[0].data.title, '🏠 Serveur de test');
    assert.ok(serverInfo.response.embeds[0].data.fields.some((field) => field.value === '42'));

    const target = {
      id: '222222222222222222',
      username: 'TestUser',
      createdTimestamp: 1600000000000,
      bot: false,
      displayAvatarURL: () => 'https://example.test/avatar.png',
    };
    const userInfo = {
      commandName: 'userinfo',
      guildId,
      guild: {
        ...guild,
        members: {
          fetch: async () => ({
            joinedTimestamp: 1700000000000,
            roles: { cache: new Collection() },
          }),
        },
      },
      options: { getUser: () => target },
      user: target,
      reply: async (response) => { userInfo.response = response; },
    };
    await handleCommand(userInfo);
    assert.equal(userInfo.response.embeds[0].data.title, '👤 TestUser');
    assert.equal(userInfo.response.allowedMentions.parse.length, 0);
  });

  it('smoke-tests the direct moderation and channel command handlers', async () => {
    const guildId = '123456789012345648';
    const targetId = '222222222222222225';
    const moderatorId = '111111111111111112';
    const target = {
      id: targetId,
      tag: 'TestUser#0001',
      username: 'TestUser',
      send: async () => {},
    };
    const member = {
      id: targetId,
      roles: { highest: { position: 1 }, cache: new Collection() },
      timeout: async () => {},
      kick: async () => {},
      setNickname: async () => {},
    };
    const moderator = {
      id: moderatorId,
      roles: { highest: { position: 50 }, cache: new Collection() },
    };
    const messages = new Collection([['message', {
      id: 'message',
      createdTimestamp: Date.now(),
      author: { id: targetId },
      content: 'Test',
    }]]);
    const channel = {
      id: '987654321098765430',
      name: 'general',
      type: 0,
      send: async () => {},
      messages: { fetch: async () => messages },
      bulkDelete: async (entries) => new Collection([...entries].map((entry) => [entry.id, entry])),
      setRateLimitPerUser: async () => {},
      permissionOverwrites: { edit: async () => {} },
    };
    const guild = {
      id: guildId,
      name: 'Serveur de test',
      ownerId: '444444444444444444',
      channels: { cache: new Collection([[channel.id, channel]]) },
      roles: { everyone: { id: guildId } },
      members: {
        me: { roles: { highest: { position: 100 } } },
        fetch: async (userId) => userId === moderatorId ? moderator : member,
        ban: async () => {},
      },
    };
    const names = [
      'warn', 'warnings', 'clearwarnings', 'untimeout', 'kick', 'ban',
      'nickname', 'purge', 'slowmode', 'lock', 'unlock',
    ];

    for (const commandName of names) {
      const interaction = {
        commandName,
        guildId,
        guild,
        channel,
        channelId: channel.id,
        user: { id: moderatorId },
        memberPermissions: { has: () => true },
        options: {
          getUser: () => target,
          getString: (name) => name === 'nickname' ? 'New nickname' : 'Test reason',
          getInteger: () => 1,
          getSubcommand: () => 'afficher',
          getChannel: () => null,
        },
        reply: async (response) => { interaction.response = response; },
        deferReply: async () => { interaction.deferred = true; },
        editReply: async (response) => { interaction.response = response; },
      };
      await handleCommand(interaction);
      assert.ok(interaction.response, `/${commandName} should reply successfully`);
    }
  });

  it('keeps Securitas limited to protection controls and separates server management', async () => {
    const interaction = {
      commandName: 'securitas',
      guildId: '123456789012345650',
      memberPermissions: { has: () => true },
      reply: async (response) => { interaction.response = response; },
    };

    await handleCommand(interaction);
    assert.equal(interaction.response.ephemeral, true);
    assert.equal(interaction.response.embeds[0].data.title, 'Securitas');
    const securitasIds = interaction.response.components.flatMap((row) => row.components.map((component) => component.data.custom_id));
    assert.equal(securitasIds.some((id) => id === 'gestion:dashboard'), false);
    assert.ok(securitasIds.some((id) => id === 'warboubou:edit:antiRaid'));
    assert.ok(securitasIds.some((id) => id === 'warboubou:edit:antiSpam'));
    assert.ok(securitasIds.some((id) => id === 'warboubou:set:antiLink:toggle'));

    const gestion = {
      commandName: 'gestion',
      guildId: interaction.guildId,
      memberPermissions: { has: () => true },
      options: { getString: () => null, getAttachment: () => null, getBoolean: () => false },
      reply: async (response) => { gestion.response = response; },
    };
    await handleCommand(gestion);
    assert.equal(gestion.response.embeds[0].data.title, '⚙️ Gestion du serveur');
    assert.equal(gestion.response.components[0].components[0].data.custom_id, 'gestion:dashboard');
    assert.deepEqual(
      gestion.response.components[0].components[0].toJSON().options.map((option) => option.value),
      ['logs', 'welcome', 'leave', 'language'],
    );

    const panel = {
      isButton: () => false,
      isModalSubmit: () => false,
      isStringSelectMenu: () => true,
      isChannelSelectMenu: () => false,
      isRoleSelectMenu: () => false,
      customId: 'gestion:dashboard',
      values: ['welcome'],
      inGuild: () => true,
      memberPermissions: { has: () => true },
      guildId: interaction.guildId,
      update: async (response) => { panel.response = response; },
    };
    assert.equal(await handleConfigInteraction(panel), true);
    assert.equal(panel.response.embeds[0].data.title, '👋 Annonce de bienvenue');
    assert.ok(panel.response.components.flatMap((row) => row.components)
      .some((component) => component.data.custom_id === 'gestion:dashboard'));

    const oldPanel = {
      ...panel,
      customId: 'securitas:dashboard',
      reply: async (response) => { oldPanel.response = response; },
    };
    assert.equal(await handleConfigInteraction(oldPanel), true);
    assert.match(oldPanel.response.content, /a été remplacé/);
  });

  it('creates a persistent giveaway and accepts each participant only once', async () => {
    const guildId = '123456789012345651';
    const sentMessages = [];
    const channel = {
      id: '987654321098765431',
      send: async (message) => {
        const created = {
          id: '987654321098765432',
          payload: message,
          edit: async (updated) => { created.payload = updated; },
          delete: async () => {},
        };
        sentMessages.push(created);
        return created;
      },
    };
    const currentChannel = { id: '987654321098765430' };
    const interaction = {
      commandName: 'giveaway',
      guildId,
      channelId: currentChannel.id,
      channel: currentChannel,
      user: { id: '111111111111111111' },
      client: { channels: { fetch: async () => channel } },
      memberPermissions: { has: () => true },
      options: {
        getString: () => 'Un mois de Nitro',
        getInteger: (name) => ({ duree: 60, gagnants: 2 })[name],
        getChannel: (name) => name === 'salon' ? channel : null,
      },
      deferReply: async () => {},
      editReply: async (response) => { interaction.response = response; },
    };
    await handleCommand(interaction);

    const settings = await getGuild(guildId);
    assert.equal(settings.giveaways.length, 1);
    assert.equal(settings.giveaways[0].prize, 'Un mois de Nitro');
    assert.equal(settings.giveaways[0].winnerCount, 2);
    assert.equal(settings.giveaways[0].channelId, channel.id);
    assert.equal(sentMessages[0].payload.components[0].components[0].data.custom_id, `giveaway:join:${settings.giveaways[0].id}`);

    const makeJoinInteraction = (userId) => ({
      isButton: () => true,
      customId: `giveaway:join:${settings.giveaways[0].id}`,
      inGuild: () => true,
      guildId,
      channelId: channel.id,
      user: { id: userId, bot: false },
      client: interaction.client,
      message: sentMessages[0],
    });
    const firstJoin = makeJoinInteraction('222222222222222222');
    firstJoin.reply = async (response) => { firstJoin.response = response; };
    assert.equal(await handleEntertainmentInteraction(firstJoin), true);
    assert.match(firstJoin.response.content, /participation est enregistrée/);
    assert.deepEqual((await getGuild(guildId)).giveaways[0].entrants, ['222222222222222222']);

    const duplicateJoin = makeJoinInteraction('222222222222222222');
    duplicateJoin.reply = async (response) => { duplicateJoin.response = response; };
    await handleEntertainmentInteraction(duplicateJoin);
    assert.match(duplicateJoin.response.content, /participes déjà/);
    assert.equal((await getGuild(guildId)).giveaways[0].entrants.length, 1);
  });

  it('explains how to choose a text channel when a giveaway is started from a non-text channel', async () => {
    const interaction = {
      commandName: 'giveaway',
      guildId: '123456789012345653',
      memberPermissions: { has: () => true },
      channel: { id: '987654321098765433' },
      options: {
        getString: () => 'Un lot',
        getInteger: (name) => ({ duree: 60, gagnants: 1 })[name],
        getChannel: () => null,
      },
      reply: async (response) => { interaction.response = response; },
    };

    await handleCommand(interaction);
    assert.equal(interaction.response.ephemeral, true);
    assert.match(interaction.response.content, /salon textuel/);
  });

  it('opens and plays the pierre-feuille-ciseaux mini-game privately', async () => {
    const start = {
      commandName: 'minijeu',
      guildId: '123456789012345652',
      memberPermissions: { has: () => false },
      reply: async (response) => { start.response = response; },
    };
    await handleCommand(start);
    assert.equal(start.response.ephemeral, true);
    assert.equal(start.response.components[0].components.length, 3);

    const play = {
      isButton: () => true,
      customId: 'minijeu:rps:pierre',
      inGuild: () => true,
      reply: async (response) => { play.response = response; },
    };
    assert.equal(await handleEntertainmentInteraction(play), true);
    assert.equal(play.response.ephemeral, true);
    assert.match(play.response.content, /Tu as choisi ✊ Pierre/);
  });

  it('starts a private multiple-choice quiz and accepts its answer once', async () => {
    const start = {
      commandName: 'quiz',
      guildId: '123456789012345652',
      user: { id: '222222222222222222' },
      reply: async (response) => { start.response = response; },
    };
    await handleCommand(start);
    assert.equal(start.response.ephemeral, true);
    assert.equal(start.response.components[0].components.length, 3);
    const customId = start.response.components[0].components[0].data.custom_id;
    assert.match(customId, /^quiz:answer:[0-9a-f-]{36}:[0-2]$/i);

    const answer = {
      isButton: () => true,
      customId,
      inGuild: () => true,
      guildId: start.guildId,
      user: { id: '222222222222222222' },
      update: async (response) => { answer.response = response; },
      reply: async (response) => { answer.response = response; },
    };
    const otherUser = {
      ...answer,
      user: { id: '333333333333333333' },
      reply: async (response) => { otherUser.response = response; },
    };
    assert.equal(await handleEntertainmentInteraction(otherUser), true);
    assert.match(otherUser.response.content, /appartient à un autre membre/);
    assert.equal(await handleEntertainmentInteraction(answer), true);
    assert.match(answer.response.embeds[0].data.title, /Bonne réponse|Mauvaise réponse/);
    assert.deepEqual(answer.response.components, []);
    await handleEntertainmentInteraction(answer);
    assert.match(answer.response.content, /a expiré/);
  });

  it('finishes expired saved giveaways after restoring them', async () => {
    const guildId = '123456789012345653';
    const settings = await getGuild(guildId);
    settings.giveaways.push({
      id: 'expired-giveaway',
      prize: 'Petit lot',
      winnerCount: 1,
      endsAt: Date.now() - 1,
      entrants: ['333333333333333333'],
      winners: [],
      ended: false,
      channelId: '987654321098765433',
      messageId: '987654321098765434',
    });
    await save();

    let updatedMessage;
    const channel = {
      messages: {
        fetch: async () => ({
          edit: async (payload) => { updatedMessage = payload; },
        }),
      },
    };
    const client = {
      guilds: { cache: new Collection([[guildId, { id: guildId }]]) },
      channels: { fetch: async () => channel },
    };
    await restoreGiveaways(client);
    await new Promise((resolve) => setTimeout(resolve, 20));

    const ended = (await getGuild(guildId)).giveaways[0];
    assert.equal(ended.ended, true);
    assert.deepEqual(ended.winners, ['333333333333333333']);
    assert.equal(updatedMessage.components[0].components[0].data.disabled, true);
  });

  it('clears the saved voice channel when the leave command is used', async () => {
    const guildId = '123456789012345679';
    const settings = await getGuild(guildId);
    settings.voiceChannelId = '555555555555555551';
    await save();

    let response;
    await handleCommand({
      commandName: 'vocal',
      guildId,
      memberPermissions: { has: () => true },
      options: { getSubcommand: () => 'quitter' },
      reply: async (message) => { response = message; },
    });

    assert.equal((await getGuild(guildId)).voiceChannelId, null);
    const persisted = JSON.parse(await readFile(process.env.CONFIG_PATH, 'utf8'));
    assert.equal(persisted.guilds[guildId].voiceChannelId, null);
    assert.match(response.content, /ne s’y reconnectera pas/);
  });

  it('lets moderators remove a specific warning', async () => {
    const guildId = '123456789012345698';
    const target = { id: '555555555555555555', tag: 'member#0001' };
    const settings = await getGuild(guildId);
    settings.warnings[target.id] = [
      { reason: 'Premier motif', by: '111111111111111111', at: 1 },
      { reason: 'Deuxième motif', by: '111111111111111111', at: 2 },
    ];
    await save();
    const interaction = {
      commandName: 'unwarn',
      guildId,
      memberPermissions: { has: () => true },
      user: { id: '111111111111111111' },
      options: {
        getUser: () => target,
        getInteger: () => 1,
      },
      guild: { members: { fetch: async () => ({}) } },
      deferReply: async () => {},
      editReply: async (response) => { interaction.response = response; },
    };

    await handleCommand(interaction);
    assert.equal((await getGuild(guildId)).warnings[target.id].length, 1);
    assert.equal((await getGuild(guildId)).warnings[target.id][0].reason, 'Deuxième motif');
    assert.match(interaction.response.content, /avertissement n° 1.*retiré/i);
  });

  it('sends member reports to the configured moderation log without pinging users', async () => {
    const guildId = '123456789012345697';
    const reporter = { id: '111111111111111111' };
    const target = { id: '222222222222222222', tag: 'reported#0001' };
    const settings = await getGuild(guildId);
    settings.logChannelId = '333333333333333333';
    await save();
    let report;
    const channel = {
      isTextBased: () => true,
      send: async (message) => { report = message; },
    };
    const interaction = {
      commandName: 'report',
      guildId,
      user: reporter,
      guild: {
        members: { fetch: async () => ({ id: target.id }) },
        channels: { fetch: async () => channel },
      },
      options: {
        getUser: () => target,
        getString: () => 'Comportement inapproprié',
      },
      deferReply: async () => {},
      editReply: async (message) => { interaction.response = message; },
    };

    await handleCommand(interaction);
    assert.equal(report.embeds[0].data.title, 'Nouveau signalement');
    assert.equal(report.embeds[0].data.fields[2].value, 'Comportement inapproprié');
    assert.deepEqual(report.allowedMentions, { parse: [] });
    assert.match(interaction.response.content, /transmis à l’équipe/);
  });
});

describe('CAPTCHA verification', () => {
  it('shows a private PNG challenge and rejects an incorrect answer', async () => {
    const guildId = '123456789012345699';
    const userId = '444444444444444444';
    const settings = await getGuild(guildId);
    settings.security.verification = { enabled: true, roleId: '666666666666666666' };
    await save();
    const member = { roles: { cache: new Collection() } };
    const guild = { members: { fetch: async () => member } };
    const start = {
      isButton: () => true,
      isModalSubmit: () => false,
      customId: 'verification:start',
      inGuild: () => true,
      guildId,
      user: { id: userId, bot: false },
      guild,
      reply: async (response) => { start.response = response; },
    };

    assert.equal(await handleVerificationInteraction(start), true);
    assert.equal(start.response.ephemeral, true);
    assert.equal(start.response.files[0].name, 'verification.png');
    assert.deepEqual(start.response.files[0].attachment.subarray(0, 8), Buffer.from('89504e470d0a1a0a', 'hex'));
    assert.equal(start.response.components[0].components[0].data.custom_id, 'verification:submit');

    const answer = {
      isButton: () => false,
      isModalSubmit: () => true,
      customId: 'verification:answer',
      inGuild: () => true,
      guildId,
      user: { id: userId, bot: false },
      guild,
      fields: { getTextInputValue: () => 'WRONG1' },
      reply: async (response) => { answer.response = response; },
    };
    assert.equal(await handleVerificationInteraction(answer), true);
    assert.match(answer.response.content, /Code incorrect/);
    assert.match(answer.response.content, /4 tentative/);
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
    assert.equal(first.voiceChannelId, null);
    assert.equal(first.ticketPanelTitle, 'Contacter le support');
    assert.match(first.ticketPanelDescription, /demande privée/);
    assert.equal(first.security.verification.enabled, false);
    assert.equal(first.security.verification.roleId, null);

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
    assert.match(replied.embeds[0].data.fields.map((field) => field.value).join('\n'), /\/securitas/);
    const persisted = JSON.parse(await readFile(process.env.CONFIG_PATH, 'utf8'));
    assert.equal(persisted.guilds['123456789012345677'], undefined);
  });

  describe('per-command interactive configuration', () => {
    it('updates anti-raid, anti-spam and anti-link settings from the Securitas dashboard', async () => {
      const guildId = '123456789012345659';
      const makeInteraction = (type, customId, extra = {}) => ({
        isButton: () => type === 'button',
        isModalSubmit: () => type === 'modal',
        isStringSelectMenu: () => type === 'string',
        isChannelSelectMenu: () => type === 'channel',
        isRoleSelectMenu: () => type === 'role',
        customId,
        inGuild: () => true,
        memberPermissions: { has: () => true },
        guildId,
        ...extra,
      });

      const toggle = makeInteraction('button', 'warboubou:set:antiRaid:toggle', {
        update: async (response) => { toggle.response = response; },
      });
      assert.equal(await handleConfigInteraction(toggle), true);
      assert.equal((await getGuild(guildId)).security.antiRaid.enabled, true);
      assert.equal(toggle.response.embeds[0].data.title, 'Securitas');

      const mode = makeInteraction('string', 'warboubou:select:antiLinkMode', {
        values: ['all'],
        update: async (response) => { mode.response = response; },
      });
      assert.equal(await handleConfigInteraction(mode), true);
      assert.equal((await getGuild(guildId)).security.antiLink.mode, 'all');
      assert.equal(mode.response.embeds[0].data.title, 'Securitas');

      const edit = makeInteraction('button', 'warboubou:edit:antiSpam', {
        showModal: async (modal) => { edit.modal = modal; },
      });
      assert.equal(await handleConfigInteraction(edit), true);
      assert.equal(edit.modal.data.custom_id, 'warboubou:save:antiSpam');

      const values = { maximum: '7', interval: '12', timeout: '4' };
      const submit = makeInteraction('modal', 'warboubou:save:antiSpam', {
        fields: { getTextInputValue: (key) => values[key] },
        update: async (response) => { submit.response = response; },
      });
      assert.equal(await handleConfigInteraction(submit), true);
      assert.deepEqual(
        ((await getGuild(guildId)).security.antiSpam),
        { enabled: false, maxMessages: 7, intervalSeconds: 12, timeoutMinutes: 4 },
      );
      assert.equal(submit.response.embeds[0].data.title, 'Securitas');
    });

    it('saves ticket panel wording and can preview or publish the active panel', async () => {
      const guildId = '123456789012345660';
      const settings = await getGuild(guildId);
      settings.ticketCategoryId = '777777777777777778';
      await save();
      const button = {
        isButton: () => true,
        isModalSubmit: () => false,
        isStringSelectMenu: () => false,
        isChannelSelectMenu: () => false,
        isRoleSelectMenu: () => false,
        customId: 'config:edit:tickets',
        inGuild: () => true,
        memberPermissions: { has: () => true },
        guildId,
        showModal: async (modal) => { button.modal = modal; },
      };
      assert.equal(await handleConfigInteraction(button), true);
      assert.equal(button.modal.data.custom_id, 'config:save:tickets');
      const values = {
        title: 'Assistance aux membres',
        description: 'Décrivez votre demande et notre équipe vous répondra en privé.',
      };
      const modal = {
        isButton: () => false,
        isModalSubmit: () => true,
        customId: 'config:save:tickets',
        inGuild: () => true,
        memberPermissions: { has: () => true },
        guildId,
        fields: { getTextInputValue: (key) => values[key] },
        update: async (response) => { modal.response = response; },
      };
      assert.equal(await handleConfigInteraction(modal), true);
      assert.equal((await getGuild(guildId)).ticketPanelTitle, values.title);
      assert.equal((await getGuild(guildId)).ticketPanelDescription, values.description);
      assert.equal(modal.response.embeds[0].data.fields.find((field) => field.name === 'Titre du panneau').value, values.title);

      const channelMessages = [];
      const channel = {
        id: '888888888888888888',
        isTextBased: () => true,
        send: async (message) => { channelMessages.push(message); },
      };
      const publish = {
        isButton: () => true,
        isModalSubmit: () => false,
        isStringSelectMenu: () => false,
        isChannelSelectMenu: () => false,
        isRoleSelectMenu: () => false,
        customId: 'config:publish:tickets',
        inGuild: () => true,
        memberPermissions: { has: () => true },
        guildId,
        channel,
        reply: async (response) => { publish.response = response; },
      };
      assert.equal(await handleConfigInteraction(publish), true);
      assert.equal(channelMessages[0].embeds[0].data.title, values.title);
      assert.equal(channelMessages[0].components[0].components[0].data.custom_id, 'ticket:open');
      assert.match(publish.response.content, /panneau actif a été publié/);
    });

    it('sends a welcome preview to the configured channel without triggering mentions', async () => {
      const guildId = '123456789012345661';
      const settings = await getGuild(guildId);
      settings.welcome.channelId = '777777777777777779';
      settings.welcome.message = 'Bienvenue {username} sur {server} !';
      await save();
      let preview;
      const channel = {
        id: settings.welcome.channelId,
        isTextBased: () => true,
        send: async (message) => { preview = message; },
      };
      const interaction = {
        isButton: () => true,
        isModalSubmit: () => false,
        isStringSelectMenu: () => false,
        isChannelSelectMenu: () => false,
        isRoleSelectMenu: () => false,
        customId: 'config:preview:welcome',
        inGuild: () => true,
        memberPermissions: { has: () => true },
        guildId,
        guild: {
          name: 'Serveur de test',
          memberCount: 42,
          channels: { fetch: async () => channel },
        },
        reply: async (response) => { interaction.response = response; },
      };
      assert.equal(await handleConfigInteraction(interaction), true);
      assert.equal(preview.embeds[0].data.description, 'Bienvenue Nouveau membre sur Serveur de test !');
      assert.deepEqual(preview.allowedMentions, { parse: [] });
      assert.match(interaction.response.content, /Aucune mention/);
    });

    it('opens the CAPTCHA settings and requires a role before enabling', async () => {
      const guildId = '123456789012345695';
      const open = {
        commandName: 'verification',
        guildId,
        memberPermissions: { has: () => true },
        options: {
          getString: () => null,
          getAttachment: () => null,
          getBoolean: () => false,
        },
        reply: async (response) => { open.response = response; },
      };
      await handleCommand(open);
      const verificationPanel = open;
      assert.equal(verificationPanel.response.embeds[0].data.title, '🔐 Vérification des nouveaux membres');
      assert.ok(verificationPanel.response.components.flatMap((row) => row.components).some((component) => component.data.custom_id === 'config:publish:verification'));

      const enable = {
        isButton: () => true,
        isModalSubmit: () => false,
        isStringSelectMenu: () => false,
        isChannelSelectMenu: () => false,
        isRoleSelectMenu: () => false,
        customId: 'config:set:verification:toggle',
        inGuild: () => true,
        memberPermissions: { has: () => true },
        guildId,
        reply: async (response) => { enable.response = response; },
      };
      await handleConfigInteraction(enable);
      assert.match(enable.response.content, /Choisissez d’abord le rôle/);
      assert.equal((await getGuild(guildId)).security.verification.enabled, false);
    });

    it('saves a manageable verification role and publishes the panel in the current channel', async () => {
      const guildId = '123456789012345694';
      const role = { id: '777777777777777777', name: 'Vérifié', position: 2, managed: false };
      let panel;
      const guild = {
        roles: { cache: new Collection([[role.id, role]]) },
        members: {
          me: {
            permissions: { has: () => true },
            roles: { highest: { position: 10 } },
          },
        },
      };
      const select = {
        isButton: () => false,
        isModalSubmit: () => false,
        isStringSelectMenu: () => false,
        isChannelSelectMenu: () => false,
        isRoleSelectMenu: () => true,
        customId: 'config:role:verification',
        values: [role.id],
        inGuild: () => true,
        memberPermissions: { has: () => true },
        guildId,
        guild,
        update: async (response) => { select.response = response; },
        reply: async (response) => { select.response = response; },
      };
      assert.equal(await handleConfigInteraction(select), true);
      assert.equal((await getGuild(guildId)).security.verification.roleId, role.id);

      const toggle = {
        ...select,
        isButton: () => true,
        isRoleSelectMenu: () => false,
        customId: 'config:set:verification:toggle',
        update: async (response) => { toggle.response = response; },
        reply: async (response) => { toggle.response = response; },
      };
      await handleConfigInteraction(toggle);
      assert.equal((await getGuild(guildId)).security.verification.enabled, true);

      const publish = {
        ...select,
        isButton: () => true,
        isRoleSelectMenu: () => false,
        customId: 'config:publish:verification',
        channel: {
          id: '888888888888888888',
          isTextBased: () => true,
          send: async (message) => { panel = message; },
        },
        reply: async (response) => { publish.response = response; },
      };
      await handleConfigInteraction(publish);
      assert.equal(panel.components[0].components[0].data.custom_id, 'verification:start');
      assert.match(publish.response.content, /panneau de vérification a été publié/);
    });

    it('persists button toggles and refreshes the same command controls', async () => {
      const interaction = {
        isButton: () => true,
        isModalSubmit: () => false,
        isStringSelectMenu: () => false,
        isChannelSelectMenu: () => false,
        isRoleSelectMenu: () => false,
        customId: 'config:set:antiSpam:toggle',
        inGuild: () => true,
        memberPermissions: { has: () => true },
        guildId: '123456789012345693',
        update: async (response) => { interaction.response = response; },
        reply: async (response) => { interaction.response = response; },
      };

      assert.equal(await handleConfigInteraction(interaction), true);
      assert.equal((await getGuild(interaction.guildId)).security.antiSpam.enabled, true);
      assert.match(interaction.response.embeds[0].data.fields[0].value, /Activé/);
    });

    it('opens a modal from the selected command and persists validated values', async () => {
      const guildId = '123456789012345691';
      const button = {
        isButton: () => true,
        isModalSubmit: () => false,
        isStringSelectMenu: () => false,
        isChannelSelectMenu: () => false,
        isRoleSelectMenu: () => false,
        customId: 'config:edit:antiSpam',
        inGuild: () => true,
        memberPermissions: { has: () => true },
        guildId,
        showModal: async (modal) => { button.modal = modal; },
      };
      assert.equal(await handleConfigInteraction(button), true);
      assert.equal(button.modal.data.custom_id, 'config:save:antiSpam');

      const values = { maximum: '7', interval: '12', timeout: '4' };
      const modal = {
        isButton: () => false,
        isModalSubmit: () => true,
        customId: 'config:save:antiSpam',
        inGuild: () => true,
        memberPermissions: { has: () => true },
        guildId,
        fields: { getTextInputValue: (key) => values[key] },
        update: async (response) => { modal.response = response; },
      };
      assert.equal(await handleConfigInteraction(modal), true);
      assert.equal(modal.response.embeds[0].data.title, '💬 Protection anti-spam');
      const persisted = JSON.parse(await readFile(process.env.CONFIG_PATH, 'utf8'));
      assert.deepEqual(persisted.guilds[guildId].security.antiSpam, {
        enabled: false,
        maxMessages: 7,
        intervalSeconds: 12,
        timeoutMinutes: 4,
      });
    });

    it('saves the language from its dedicated buttons', async () => {
      const interaction = {
        isButton: () => true,
        isModalSubmit: () => false,
        isStringSelectMenu: () => false,
        isChannelSelectMenu: () => false,
        isRoleSelectMenu: () => false,
        customId: 'config:set:language:en',
        inGuild: () => true,
        memberPermissions: { has: () => true },
        guildId: '123456789012345694',
        update: async (response) => { interaction.response = response; },
        reply: async (response) => { interaction.response = response; },
      };
      assert.equal(await handleConfigInteraction(interaction), true);
      assert.equal((await getGuild(interaction.guildId)).security.language, 'en');
      assert.match(interaction.response.embeds[0].data.fields[0].value, /English/);
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
      memberPermissions: { has: () => true },
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

  it('explains when purge or slowmode is used outside a compatible text channel', async () => {
    for (const commandName of ['purge', 'slowmode']) {
      const interaction = {
        commandName,
        guildId: `12345678901234569${commandName === 'purge' ? '1' : '2'}`,
        memberPermissions: { has: () => true },
        channel: {},
        options: {
          getInteger: () => 10,
          getUser: () => null,
        },
        deferred: false,
        deferReply: async () => { interaction.deferred = true; },
        reply: async (response) => { interaction.response = response; },
      };

      await handleCommand(interaction);
      assert.equal(interaction.deferred, false);
      assert.equal(interaction.response.ephemeral, true);
      assert.match(interaction.response.content, /salon textuel/);
    }
  });

  it('configures the moderation log channel from its own command and displays entries', async () => {
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
      memberPermissions: { has: () => true },
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
      memberPermissions: { has: () => true },
      guild: { bans: { fetch: async () => new Collection([[bannedUser.id, { user: bannedUser, reason: 'Test' }]]) } },
      options: { getString: () => null, getSubcommand: () => 'liste', getInteger: () => 1 },
      deferReply: async () => {},
      editReply: async (message) => { interaction.response = message; },
    };

    await handleCommand(interaction);
    assert.match(interaction.response.embeds[0].data.description, /BannedUser/);
    assert.match(interaction.response.embeds[0].data.description, /Test/);
  });

  it('opens the welcome panel from Gestion and lets administrators toggle the arrival ping', async () => {
    const guildId = '123456789012345684';
    const interaction = {
      commandName: 'gestion',
      guildId,
      memberPermissions: { has: () => true },
      options: {
        getString: () => 'welcome',
        getAttachment: () => null,
        getBoolean: () => false,
      },
      reply: async (message) => { interaction.response = message; },
    };

    await handleCommand(interaction);
    assert.equal(interaction.response.embeds[0].data.title, '👋 Annonce de bienvenue');
    assert.ok(interaction.response.components.flatMap((row) => row.components).some((component) => component.data.custom_id === 'config:set:welcomePing:toggle'));

    const pingButton = {
      isButton: () => true,
      isModalSubmit: () => false,
      isStringSelectMenu: () => false,
      isChannelSelectMenu: () => false,
      isRoleSelectMenu: () => false,
      customId: 'config:set:welcomePing:toggle',
      inGuild: () => true,
      memberPermissions: { has: () => true },
      guildId,
      update: async (message) => { pingButton.response = message; },
      reply: async (message) => { pingButton.response = message; },
    };
    await handleConfigInteraction(pingButton);
    assert.equal((await getGuild(guildId)).welcome.ping, false);
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
      memberPermissions: { has: () => true },
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
      memberPermissions: { has: () => true },
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

  it('opens the interactive tickets dashboard with configuration and publishing controls', async () => {
    const guildId = '123456789012345687';
    const interaction = {
      commandName: 'tickets',
      guildId,
      memberPermissions: { has: () => true },
      reply: async (message) => { interaction.response = message; },
    };

    await handleCommand(interaction);
    assert.equal(interaction.response.ephemeral, true);
    assert.equal(interaction.response.embeds[0].data.title, '🎫 Configuration des tickets');
    const componentIds = interaction.response.components.flatMap((row) =>
      row.components.map((component) => component.data.custom_id),
    );
    assert.deepEqual(componentIds, [
      'config:channel:ticketCategory',
      'config:role:ticketSupport',
      'config:clear:ticketCategory',
      'config:clear:ticketRole',
      'config:edit:tickets',
      'config:preview:tickets',
      'config:publish:tickets',
    ]);
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
  it('announces online and graceful offline states in the configured log channel', async () => {
    const { handleBotStatus, sendSupportAlert } = await import('../src/member-events.js');
    const guildId = '1565306572937232417';
    const settings = await getGuild(guildId);
    settings.logChannelId = '987654321098765438';
    const version = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version;
    settings.announcedBotVersion = `${version}-previous`;
    await save();

    const sent = [];
    const botMember = {};
    const channel = {
      id: settings.logChannelId,
      name: 'bot-status',
      isTextBased: () => true,
      permissionsFor: () => ({ has: () => true }),
      send: async (message) => { sent.push(message); },
    };
    const guild = {
      id: guildId,
      name: 'Support server',
      members: { me: botMember },
      systemChannel: null,
      channels: {
        cache: new Collection([[channel.id, channel]]),
        fetch: async (id) => id === channel.id ? channel : null,
      },
    };
    let otherGuildStatusCount = 0;
    const otherGuildChannel = {
      id: '987654321098765439',
      name: 'other-server-status',
      isTextBased: () => true,
      permissionsFor: () => ({ has: () => true }),
      send: async () => { otherGuildStatusCount += 1; },
    };
    const otherGuild = {
      id: '123456789012345695',
      name: 'Other server',
      members: { me: botMember },
      systemChannel: otherGuildChannel,
      channels: {
        cache: new Collection([[otherGuildChannel.id, otherGuildChannel]]),
        fetch: async () => otherGuildChannel,
      },
    };
    const client = {
      user: { tag: 'ModerationBot#0001' },
      guilds: { cache: new Collection([[guild.id, guild], [otherGuild.id, otherGuild]]) },
    };

    await handleBotStatus(client, 'online');
    await handleBotStatus(client, 'disconnected', '1006');
    await handleBotStatus(client, 'reconnected');
    await handleBotStatus(client, 'offline', 'test');
    assert.equal(sent.length, 5);
    assert.equal(sent[0].embeds[0].data.title, '🟢 Bot en ligne');
    assert.equal(sent[1].embeds[0].data.title, '📦 Mise à jour du bot');
    assert.match(sent[1].embeds[0].data.description, new RegExp(version));
    assert.equal(sent[2].embeds[0].data.title, '🟠 Connexion Discord interrompue');
    assert.equal(sent[3].embeds[0].data.title, '🟢 Connexion Discord rétablie');
    assert.match(sent[4].embeds[0].data.description, /sera hors ligne après cet arrêt propre \(test\)/);
    assert.deepEqual(sent[0].allowedMentions, { parse: [] });
    assert.equal(otherGuildStatusCount, 0);
    assert.equal(settings.announcedBotVersion, version);

    const resultWithoutSupportServer = await handleBotStatus({
      user: client.user,
      guilds: { cache: new Collection([[otherGuild.id, otherGuild]]) },
    }, 'online');
    assert.deepEqual(resultWithoutSupportServer, []);
    assert.equal(await sendSupportAlert({
      user: client.user,
      guilds: { cache: new Collection([[otherGuild.id, otherGuild]]) },
    }, { title: 'Test alert', description: 'Should not be sent elsewhere' }), null);
    assert.equal(otherGuildStatusCount, 0);
  });

  it('thanks the person who added the bot and lists its commands in the system channel', async () => {
    const { handleGuildJoined } = await import('../src/member-events.js');
    let sent;
    const inviter = { id: '111111111111111111' };
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
      client: { user: { id: '999999999999999991', username: 'Moderation Bot' } },
      members: { me: {} },
      systemChannel,
      channels: { cache: new Collection([[systemChannel.id, systemChannel]]) },
      fetchAuditLogs: async () => ({
        entries: new Collection([['bot-add', {
          target: { id: '999999999999999991' },
          executor: inviter,
          createdTimestamp: Date.now(),
        }]]),
      }),
    };

    assert.equal(await handleGuildJoined(guild), systemChannel.id);
    assert.match(sent.embeds[0].data.description, /<@111111111111111111> d’avoir ajouté \*\*Moderation Bot\*\*/);
    const commandFields = sent.embeds[0].data.fields;
    assert.ok(commandFields.some((field) => field.value.includes('**/tickets**')));
    assert.ok(commandFields.some((field) => field.value.includes('**/giveaway**')));
    assert.ok(commandFields.some((field) => field.value.includes('**/minijeu**')));
    assert.deepEqual(sent.allowedMentions, { users: [inviter.id] });
  });

  it('still sends the welcome and full command list when audit log access is unavailable', async () => {
    const { handleGuildJoined } = await import('../src/member-events.js');
    let sent;
    const systemChannel = {
      id: '987654321098765430',
      isTextBased: () => true,
      permissionsFor: () => ({ has: () => true }),
      send: async (message) => { sent = message; },
    };
    const guild = {
      id: '123456789012345692',
      name: 'Test server',
      client: { user: { id: '999999999999999991', username: 'Moderation Bot' } },
      members: { me: {} },
      systemChannel,
      channels: { cache: new Collection([[systemChannel.id, systemChannel]]) },
      fetchAuditLogs: async () => { throw Object.assign(new Error('Missing permission'), { code: 50013 }); },
    };

    assert.equal(await handleGuildJoined(guild), systemChannel.id);
    assert.match(sent.embeds[0].data.description, /Merci à toute l’équipe d’avoir ajouté/);
    assert.ok(sent.embeds[0].data.fields.some((field) => field.value.includes('**/aide**')));
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
      user: { username: 'TestUser', tag: 'TestUser#0001', displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/1/avatar.png' },
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
    assert.equal(sent.embeds[0].data.title, 'Bienvenue sur le serveur');
    assert.equal(sent.embeds[0].data.author.name, 'TestUser#0001');
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
      user: { username: 'TestUser', tag: 'TestUser#0001', displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/1/avatar.png' },
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

  it('does not delete higher-role members’ messages when the bot cannot timeout them', async () => {
    const guildId = '123456789012345676';
    const settings = await getGuild(guildId);
    settings.security.antiSpam.enabled = true;
    settings.security.antiSpam.maxMessages = 3;
    settings.security.antiSpam.intervalSeconds = 8;
    settings.logChannelId = '987654321098765432';
    await save();

    let deleted = 0;
    let timeouts = 0;
    const logs = [];
    const member = {
      id: '333333333333333334',
      permissions: { has: () => false },
      roles: { highest: { position: 20 }, cache: new Map() },
      timeout: async () => { timeouts += 1; },
      user: { send: async () => {} },
    };
    const guild = {
      id: guildId,
      name: 'Test server',
      ownerId: '444444444444444444',
      members: { me: { roles: { highest: { position: 10 } } } },
      channels: {
        cache: new Map([['987654321098765432', {
          isTextBased: () => true,
          send: async (message) => logs.push(message),
        }]]),
      },
    };
    const createMessage = () => ({
      guild,
      guildId,
      channelId: '555555555555555556',
      content: 'repeated message',
      author: { id: member.id, bot: false },
      member,
      inGuild: () => true,
      delete: async () => { deleted += 1; },
    });

    await security.handleMessageCreate(createMessage());
    await security.handleMessageCreate(createMessage());
    await security.handleMessageCreate(createMessage());

    assert.equal(deleted, 0);
    assert.equal(timeouts, 0);
    assert.equal(logs.length, 1);
  });

  it('raises verification after the configured join threshold', async () => {
    const guildId = '123456789012345675';
    const settings = await getGuild(guildId);
    settings.security.antiRaid.enabled = true;
    settings.security.antiRaid.joinThreshold = 3;
    settings.security.antiRaid.intervalSeconds = 15;
    settings.security.antiRaid.protectionMinutes = 10;
    await save();

    const supportGuildId = '1565306572937232417';
    const supportSettings = await getGuild(supportGuildId);
    supportSettings.logChannelId = '987654321098765438';
    await save();
    const supportAlerts = [];
    const supportChannel = {
      id: '987654321098765438',
      name: 'support-alerts',
      isTextBased: () => true,
      permissionsFor: () => ({ has: () => true }),
      send: async (message) => { supportAlerts.push(message); },
    };
    const supportGuild = {
      id: supportGuildId,
      name: 'Support server',
      members: { me: {} },
      systemChannel: null,
      channels: {
        cache: new Collection([[supportChannel.id, supportChannel]]),
        fetch: async (channelId) => channelId === supportChannel.id ? supportChannel : null,
      },
    };
    const client = {
      user: { tag: 'ModerationBot#0001' },
      guilds: { cache: new Collection([[supportGuildId, supportGuild]]) },
    };
    supportGuild.client = client;
    const guild = {
      id: guildId,
      name: 'Protected server',
      client,
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
    assert.equal(supportAlerts.length, 1);
    assert.equal(supportAlerts[0].embeds[0].data.title, '🚨 Alerte anti-raid');
    assert.match(supportAlerts[0].embeds[0].data.description, /Protected server/);
    assert.deepEqual(supportAlerts[0].allowedMentions, { parse: [] });
  });
});
