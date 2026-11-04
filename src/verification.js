import { randomInt, timingSafeEqual } from 'node:crypto';
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { PNG } from 'pngjs';
import { getGuild } from './store.js';

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const challenges = new Map();
const challengeLifetime = 5 * 60_000;
const maximumAttempts = 5;

const font = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01111', '10000', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  J: ['00111', '00010', '00010', '00010', '10010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  6: ['01111', '10000', '10000', '11110', '10001', '10001', '01110'],
  7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  9: ['01110', '10001', '10001', '01111', '00001', '00001', '11110'],
};

function challengeKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function pruneChallenges(now) {
  for (const [key, challenge] of challenges) {
    if (challenge.expiresAt <= now) challenges.delete(key);
  }
}

function setPixel(png, x, y, color) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const index = (y * png.width + x) * 4;
  png.data[index] = color[0];
  png.data[index + 1] = color[1];
  png.data[index + 2] = color[2];
  png.data[index + 3] = 255;
}

function drawLine(png, x0, y0, x1, y1, color) {
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  while (true) {
    setPixel(png, x0, y0, color);
    if (x0 === x1 && y0 === y1) break;
    const doubledError = 2 * error;
    if (doubledError >= dy) {
      error += dy;
      x0 += sx;
    }
    if (doubledError <= dx) {
      error += dx;
      y0 += sy;
    }
  }
}

function createCaptchaImage(code) {
  const png = new PNG({ width: 320, height: 110 });
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const shade = randomInt(226, 250);
      setPixel(png, x, y, [shade, shade, shade]);
    }
  }

  for (let line = 0; line < 7; line += 1) {
    const color = [randomInt(115, 185), randomInt(115, 185), randomInt(115, 185)];
    drawLine(png, randomInt(0, png.width), randomInt(0, png.height), randomInt(0, png.width), randomInt(0, png.height), color);
  }
  for (let dot = 0; dot < 1000; dot += 1) {
    const shade = randomInt(150, 210);
    setPixel(png, randomInt(0, png.width), randomInt(0, png.height), [shade, shade, shade]);
  }

  const scale = 7;
  const charWidth = 5 * scale;
  const gap = 9;
  const startX = Math.floor((png.width - (code.length * charWidth + (code.length - 1) * gap)) / 2);
  for (let character = 0; character < code.length; character += 1) {
    const glyph = font[code[character]];
    const xOffset = startX + character * (charWidth + gap);
    const yOffset = randomInt(25, 34);
    const color = [randomInt(20, 75), randomInt(25, 80), randomInt(35, 95)];
    for (let row = 0; row < glyph.length; row += 1) {
      const rowShift = Math.round(Math.sin(row + character) * 2);
      for (let column = 0; column < glyph[row].length; column += 1) {
        if (glyph[row][column] !== '1') continue;
        for (let pixelY = 0; pixelY < scale; pixelY += 1) {
          for (let pixelX = 0; pixelX < scale; pixelX += 1) {
            setPixel(png, xOffset + column * scale + pixelX + rowShift, yOffset + row * scale + pixelY, color);
          }
        }
      }
    }
  }

  return PNG.sync.write(png);
}

function makeCode() {
  return Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join('');
}

function makeStartResponse(guildId, userId) {
  const now = Date.now();
  pruneChallenges(now);
  if (challenges.size >= 10_000 && !challenges.has(challengeKey(guildId, userId))) {
    throw new Error('Trop de vérifications sont en cours. Réessayez dans quelques minutes.');
  }
  const code = makeCode();
  challenges.set(challengeKey(guildId, userId), { code, expiresAt: now + challengeLifetime, attempts: 0 });
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Vérification humaine')
    .setDescription('Recopiez les **6 caractères** de l’image dans le formulaire. Le code expire dans 5 minutes.');
  return {
    embeds: [embed],
    files: [new AttachmentBuilder(createCaptchaImage(code), { name: 'verification.png' })],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('verification:submit').setLabel('Saisir le code').setStyle(ButtonStyle.Primary),
    )],
    ephemeral: true,
  };
}

function answerModal() {
  const input = new TextInputBuilder()
    .setCustomId('code')
    .setLabel('Les 6 caractères visibles sur l’image')
    .setPlaceholder('Exemple : A7K3MP')
    .setStyle(TextInputStyle.Short)
    .setMinLength(6)
    .setMaxLength(12)
    .setRequired(true);
  return new ModalBuilder()
    .setCustomId('verification:answer')
    .setTitle('Vérification du serveur')
    .addComponents(new ActionRowBuilder().addComponents(input));
}

function codeMatches(answer, expected) {
  const normalized = answer.trim().toUpperCase();
  if (normalized.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(normalized), Buffer.from(expected));
}

export async function handleVerificationInteraction(interaction) {
  const isStart = interaction.isButton() && interaction.customId === 'verification:start';
  const isSubmit = interaction.isButton() && interaction.customId === 'verification:submit';
  const isAnswer = interaction.isModalSubmit() && interaction.customId === 'verification:answer';
  if (!isStart && !isSubmit && !isAnswer) return false;

  if (!interaction.inGuild()) {
    await interaction.reply({ content: 'La vérification doit être lancée depuis le panneau du serveur.', ephemeral: true });
    return true;
  }

  const settings = await getGuild(interaction.guildId);
  const verification = settings.security.verification;
  if (!verification.enabled || !verification.roleId) {
    await interaction.reply({ content: 'La vérification est momentanément indisponible. Prévenez un administrateur du serveur.', ephemeral: true });
    return true;
  }
  if (interaction.user.bot) {
    await interaction.reply({ content: 'Les comptes automatisés ne peuvent pas effectuer cette vérification.', ephemeral: true });
    return true;
  }

  const key = challengeKey(interaction.guildId, interaction.user.id);
  if (isStart) {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (member.roles.cache.has(verification.roleId)) {
      await interaction.reply({ content: 'Votre compte est déjà vérifié.', ephemeral: true });
      return true;
    }
    await interaction.reply(makeStartResponse(interaction.guildId, interaction.user.id));
    return true;
  }

  const challenge = challenges.get(key);
  if (!challenge || challenge.expiresAt <= Date.now()) {
    challenges.delete(key);
    await interaction.reply({
      content: 'Cette vérification a expiré. Cliquez de nouveau sur le panneau pour obtenir une nouvelle image.',
      ephemeral: true,
    });
    return true;
  }

  if (isSubmit) {
    await interaction.showModal(answerModal());
    return true;
  }

  const answer = interaction.fields.getTextInputValue('code');
  if (!codeMatches(answer, challenge.code)) {
    challenge.attempts += 1;
    const remaining = maximumAttempts - challenge.attempts;
    if (remaining <= 0) challenges.delete(key);
    await interaction.reply({
      content: remaining > 0
        ? `Code incorrect. Il vous reste ${remaining} tentative(s).`
        : 'Trop de tentatives incorrectes. Cliquez de nouveau sur le panneau pour recommencer.',
      ephemeral: true,
    });
    return true;
  }

  const role = await interaction.guild.roles.fetch(verification.roleId);
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
  if (
    !role
    || role.id === interaction.guildId
    || role.managed
    || !botMember.permissions.has(PermissionFlagsBits.ManageRoles)
    || role.position >= botMember.roles.highest.position
  ) {
    await interaction.reply({ content: 'Le rôle de vérification n’est plus attribuable. Prévenez un administrateur.', ephemeral: true });
    return true;
  }
  await member.roles.add(role, 'Vérification CAPTCHA réussie');
  challenges.delete(key);
  await interaction.reply({ content: `Vérification réussie : le rôle **${role.name}** vous a été attribué.`, ephemeral: true });
  return true;
}
