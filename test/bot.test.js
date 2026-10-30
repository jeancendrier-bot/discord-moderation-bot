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
let security;

before(async () => {
  dataDirectory = await mkdtemp(join(tmpdir(), 'moderation-bot-test-'));
  process.env.CONFIG_PATH = join(dataDirectory, 'config.json');
  ({ getGuild, removeMemberEventImage, save, saveMemberEventImage } = await import('../src/store.js'));
  ({ commands, handleCommand } = await import('../src/commands.js'));
  security = await import('../src/security.js');
});

after(async () => {
  await rm(dataDirectory, { recursive: true, force: true });
});

describe('slash command definitions', () => {
  it('serialize unique commands with valid Discord descriptions', async () => {
    const names = commands.map((command) => command.name);
    assert.equal(names.length, 20);
    assert.equal(new Set(names).size, names.length);

    const inspect = (option, path) => {
      assert.ok(option.name, `${path} has a name`);
      assert.ok(option.description, `${path} has a description`);
      assert.ok(option.description.length <= 100, `${path} description is within Discord limits`);
      for (const child of option.options ?? []) inspect(child, `${path}/${child.name}`);
    };

    for (const command of commands) inspect(command, `/${command.name}`);
    const config = commands.find((command) => command.name === 'config');
    assert.deepEqual(config.options.map((option) => option.name), ['afficher', 'langue', 'antilien', 'antispam', 'antiraid']);
    assert.deepEqual(commands.find((command) => command.name === 'unban').options.map((option) => option.name), ['retirer', 'liste']);
    assert.ok(commands.some((command) => command.name === 'logs'));
    assert.ok(commands.some((command) => command.name === 'bienvenue'));
    assert.ok(commands.some((command) => command.name === 'depart'));
    const helpInteraction = { commandName: 'aide', reply: async (message) => { helpInteraction.response = message; } };
    await handleCommand(helpInteraction);
    for (const field of helpInteraction.response.embeds[0].data.fields) {
      assert.ok(field.name.length <= 256, 'help field names fit Discord embed limits');
      assert.ok(field.value.length <= 1024, 'help field values fit Discord embed limits');
    }
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

  it('configures and displays the moderation log channel', async () => {
    const guildId = '123456789012345680';
    const settings = await getGuild(guildId);
    const channel = { id: '987654321098765434', name: 'mod-logs' };
    const configuredInteraction = {
      commandName: 'logs',
      guildId,
      options: {
        getString: () => null,
        getSubcommand: () => 'salon',
        getChannel: () => channel,
      },
      reply: async (message) => { configuredInteraction.response = message; },
    };
    await handleCommand(configuredInteraction);
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
  it('sends a configured welcome embed with its stored image and only mentions the new member', async () => {
    const { handleMemberEvent } = await import('../src/member-events.js');
    const guildId = '123456789012345679';
    const settings = await getGuild(guildId);
    settings.welcome.enabled = true;
    settings.welcome.channelId = '987654321098765433';
    settings.welcome.message = 'Bienvenue {user} sur {server} !';
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
    assert.equal(sent.embeds[0].data.description, `Bienvenue <@${member.id}> sur Test server !`);
    assert.deepEqual(sent.allowedMentions, { users: [member.id] });
    assert.equal(sent.files.length, 1);
    assert.equal(sent.embeds[0].data.image.url, 'attachment://welcome-image.png');
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
