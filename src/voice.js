import { ChannelType, PermissionFlagsBits } from 'discord.js';
import {
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
  VoiceConnectionStatus,
} from '@discordjs/voice';
import { getGuild, save } from './store.js';

const monitoredConnections = new WeakSet();
const reconnectTimers = new Map();
const reconnectAttempts = new Map();

function watchConnection(guild, connection) {
  if (monitoredConnections.has(connection)) return;
  monitoredConnections.add(connection);
  connection.on('stateChange', (_oldState, newState) => {
    if (newState.status === VoiceConnectionStatus.Ready) {
      reconnectAttempts.delete(guild.id);
    } else if (newState.status === VoiceConnectionStatus.Destroyed) {
      scheduleReconnect(guild);
    }
  });
}

function scheduleReconnect(guild) {
  if (reconnectTimers.has(guild.id)) return;
  const attempt = (reconnectAttempts.get(guild.id) || 0) + 1;
  reconnectAttempts.set(guild.id, attempt);
  const delay = Math.min(5_000 * (2 ** (attempt - 1)), 60_000);
  const timer = setTimeout(() => {
    reconnectTimers.delete(guild.id);
    restoreConfiguredVoice(guild).catch((error) => {
      console.error(`[moderation-bot] Reconnexion vocale impossible sur ${guild.id} :`, error);
    });
  }, delay);
  timer.unref?.();
  reconnectTimers.set(guild.id, timer);
}

async function startVoiceConnection(guild, channel) {
  if (channel.type !== ChannelType.GuildVoice) {
    throw new Error('Le salon vocal enregistré n’existe plus ou n’est pas un salon vocal standard.');
  }
  const botMember = guild.members.me ?? await guild.members.fetchMe();
  const permissions = channel.permissionsFor(botMember);
  if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect])) {
    throw new Error('Le bot doit avoir les permissions « Voir le salon » et « Se connecter » dans ce salon vocal.');
  }

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: true,
    selfMute: true,
  });
  watchConnection(guild, connection);
  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
  } catch (error) {
    connection.destroy();
    throw error;
  }
  return connection;
}

export async function connectConfiguredVoice(guild, channel) {
  const settings = await getGuild(guild.id);
  const previousChannelId = settings.voiceChannelId;
  settings.voiceChannelId = channel.id;
  await save();

  try {
    return await startVoiceConnection(guild, channel);
  } catch (error) {
    settings.voiceChannelId = previousChannelId;
    await save();
    throw error;
  }
}

export async function disconnectConfiguredVoice(guildId) {
  const settings = await getGuild(guildId);
  const wasConfigured = Boolean(settings.voiceChannelId);
  settings.voiceChannelId = null;
  await save();
  const connection = getVoiceConnection(guildId);
  if (connection) connection.destroy();
  reconnectAttempts.delete(guildId);
  const timer = reconnectTimers.get(guildId);
  if (timer) clearTimeout(timer);
  reconnectTimers.delete(guildId);
  return Boolean(connection) || wasConfigured;
}

export async function restoreConfiguredVoice(guild) {
  const settings = await getGuild(guild.id);
  if (!settings.voiceChannelId) return false;

  const currentConnection = getVoiceConnection(guild.id);
  if (currentConnection?.state.status === VoiceConnectionStatus.Ready) return true;

  try {
    const channel = await guild.channels.fetch(settings.voiceChannelId);
    if (!channel) throw new Error('Le salon vocal configuré est introuvable.');
    await startVoiceConnection(guild, channel);
    console.log(`[moderation-bot] Connexion vocale rétablie sur ${guild.id}.`);
    return true;
  } catch (error) {
    console.error(`[moderation-bot] Restauration vocale impossible sur ${guild.id} :`, error.message);
    scheduleReconnect(guild);
    return false;
  }
}
