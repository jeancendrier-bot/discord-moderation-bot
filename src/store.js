import { readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

// Warnings and the log channel persist to the FadeHost bot's /data volume.
const DATA_FILE = process.env.CONFIG_PATH || '/data/moderation-config.json';
const IMAGE_DIRECTORY = join(dirname(DATA_FILE), `${basename(DATA_FILE)}.assets`);
const IMAGE_TYPES = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/gif', '.gif'],
  ['image/webp', '.webp'],
]);

function matchesImageType(buffer, contentType) {
  if (contentType === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  if (contentType === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (contentType === 'image/gif') return buffer.subarray(0, 6).toString('ascii').match(/^GIF8[79]a$/) !== null;
  if (contentType === 'image/webp') {
    return buffer.subarray(0, 4).toString('ascii') === 'RIFF'
      && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  return false;
}

let cache = null;
let loading = null;
let saveQueue = Promise.resolve();

async function load() {
  if (cache) return cache;
  if (!loading) {
    loading = (async () => {
      try {
        const parsed = JSON.parse(await readFile(DATA_FILE, 'utf8'));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('Le fichier de configuration doit contenir un objet JSON.');
        }
        cache = parsed;
      } catch (err) {
        if (err.code !== 'ENOENT') {
          console.error('[moderation-bot] Impossible de lire la configuration :', err.message);
          throw err;
        }
        cache = { guilds: {} };
      }
      if (!cache.guilds || typeof cache.guilds !== 'object' || Array.isArray(cache.guilds)) cache.guilds = {};
      return cache;
    })();
  }
  try {
    return await loading;
  } catch (err) {
    loading = null;
    throw err;
  }
}

export function save() {
  if (!cache) throw new Error('La configuration doit être chargée avant son enregistrement.');
  const contents = JSON.stringify(cache, null, 2);
  const temporaryFile = `${DATA_FILE}.${randomUUID()}.tmp`;
  const write = async () => {
    try {
      await mkdir(dirname(DATA_FILE), { recursive: true });
      await writeFile(temporaryFile, contents, 'utf8');
      await rename(temporaryFile, DATA_FILE);
    } catch (err) {
      console.error('[moderation-bot] Impossible d’enregistrer la configuration :', err.message);
      throw err;
    }
  };
  const operation = saveQueue.then(write);
  saveQueue = operation.catch(() => {});
  return operation;
}

export async function saveMemberEventImage(guildId, event, attachment) {
  if (!/^\d{17,20}$/.test(guildId) || !['welcome', 'leave'].includes(event)) {
    throw new Error('Identifiant de serveur ou type d’image invalide.');
  }
  if (!attachment || !IMAGE_TYPES.has(attachment.contentType) || attachment.size > 8 * 1024 * 1024) {
    throw new Error('L’image doit être un fichier PNG, JPEG, GIF ou WebP de 8 Mo maximum.');
  }

  const url = new URL(attachment.url);
  if (url.protocol !== 'https:' || url.hostname !== 'cdn.discordapp.com') {
    throw new Error('Seules les images jointes depuis le CDN sécurisé de Discord sont acceptées.');
  }

  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Téléchargement de l’image impossible (HTTP ${response.status}).`);
  const contentType = response.headers.get('content-type')?.split(';')[0].trim();
  const extension = IMAGE_TYPES.get(contentType);
  if (!extension || contentType !== attachment.contentType) {
    throw new Error('Le type réel du fichier ne correspond pas à une image autorisée.');
  }
  const maxBytes = 8 * 1024 * 1024;
  const declaredLength = Number(response.headers.get('content-length'));
  if (declaredLength > maxBytes) {
    throw new Error('L’image doit peser entre 1 octet et 8 Mo.');
  }
  if (!response.body) throw new Error('Le téléchargement de l’image n’a retourné aucun contenu.');
  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new Error('L’image doit peser entre 1 octet et 8 Mo.');
    }
    chunks.push(Buffer.from(value));
  }
  const image = Buffer.concat(chunks, totalBytes);
  if (image.length === 0 || !matchesImageType(image, contentType)) {
    throw new Error('Le contenu du fichier ne correspond pas à une image PNG, JPEG, GIF ou WebP valide.');
  }

  const filePath = join(IMAGE_DIRECTORY, `${guildId}-${event}${extension}`);
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  await mkdir(IMAGE_DIRECTORY, { recursive: true });
  try {
    await writeFile(temporaryPath, image);
    await rename(temporaryPath, filePath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }

  return filePath;
}

export async function removeMemberEventImage(imagePath) {
  if (!imagePath) return;
  const resolvedPath = resolve(imagePath);
  if (!resolvedPath.startsWith(`${resolve(IMAGE_DIRECTORY)}/`)) {
    throw new Error('Le chemin de l’image configurée est invalide.');
  }
  await rm(resolvedPath, { force: true });
}

export async function getGuild(guildId) {
  const data = await load();
  let changed = false;
  if (!data.guilds[guildId]) {
    data.guilds[guildId] = {};
    changed = true;
  }
  const settings = data.guilds[guildId];
  if (!Object.hasOwn(settings, 'logChannelId')) {
    settings.logChannelId = (process.env.MODLOG_CHANNEL_ID || '').trim() || null;
    changed = true;
  }
  if (!settings.warnings || typeof settings.warnings !== 'object' || Array.isArray(settings.warnings)) {
    settings.warnings = {};
    changed = true;
  }
  if (!Object.hasOwn(settings, 'ticketCategoryId')) {
    settings.ticketCategoryId = null;
    changed = true;
  }
  if (!Object.hasOwn(settings, 'ticketSupportRoleId')) {
    settings.ticketSupportRoleId = null;
    changed = true;
  }
  if (!Object.hasOwn(settings, 'ticketPanelTitle')) {
    settings.ticketPanelTitle = 'Contacter le support';
    changed = true;
  }
  if (!Object.hasOwn(settings, 'ticketPanelDescription')) {
    settings.ticketPanelDescription = 'Cliquez sur le bouton ci-dessous pour transmettre une demande privée à l’équipe de support. Décrivez clairement votre besoin ; un membre de l’équipe vous répondra dans votre ticket.';
    changed = true;
  }
  if (!Object.hasOwn(settings, 'voiceChannelId')) {
    settings.voiceChannelId = null;
    changed = true;
  }
  for (const [key, defaultMessage] of [
    ['welcome', 'Bienvenue {user} sur {server} !'],
    ['leave', '{username} a quitté {server}.'],
  ]) {
    const pingDefault = key === 'welcome';
    if (!settings[key] || typeof settings[key] !== 'object' || Array.isArray(settings[key])) {
      settings[key] = { enabled: false, channelId: null, message: defaultMessage, imagePath: null, ping: pingDefault };
      changed = true;
      continue;
    }
    for (const [option, value] of Object.entries({
      enabled: false,
      channelId: null,
      message: defaultMessage,
      imagePath: null,
      ping: pingDefault,
    })) {
      if (!Object.hasOwn(settings[key], option)) {
        settings[key][option] = value;
        changed = true;
      }
    }
  }
  if (!settings.security || typeof settings.security !== 'object' || Array.isArray(settings.security)) {
    settings.security = {};
    changed = true;
  }
  const securityDefaults = {
    language: 'fr',
    antiLink: { enabled: false, mode: 'invites', exemptRoleId: null },
    antiSpam: { enabled: false, maxMessages: 5, intervalSeconds: 8, timeoutMinutes: 5 },
    antiRaid: { enabled: false, joinThreshold: 8, intervalSeconds: 15, protectionMinutes: 10 },
    verification: { enabled: false, roleId: null },
    raidProtection: null,
  };
  for (const [key, defaultValue] of Object.entries(securityDefaults)) {
    if (key === 'antiLink' || key === 'antiSpam' || key === 'antiRaid' || key === 'verification') {
      if (!settings.security[key] || typeof settings.security[key] !== 'object' || Array.isArray(settings.security[key])) {
        settings.security[key] = { ...defaultValue };
        changed = true;
      } else {
        for (const [option, value] of Object.entries(defaultValue)) {
          if (!Object.hasOwn(settings.security[key], option)) {
            settings.security[key][option] = value;
            changed = true;
          }
        }
      }
    } else if (!Object.hasOwn(settings.security, key)) {
      settings.security[key] = defaultValue;
      changed = true;
    }
  }
  if (changed) await save();
  return settings;
}
