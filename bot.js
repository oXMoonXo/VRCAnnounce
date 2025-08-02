// bot.js
require('dotenv').config();

const {
  Client,
  IntentsBitField,
  Events,
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder
} = require('discord.js');
const { InteractionResponseFlags } = require('discord-api-types/v10');

const DISCORD_TOKEN   = process.env.DISCORD_TOKEN;
const VRC_AUTH_COOKIE = process.env.VRC_AUTH_COOKIE;
const GROUP_ID        = process.env.GROUP_ID;
const ALLOWED_ROLE    = process.env.ALLOWED_ROLE || 'Announcer';

if (!DISCORD_TOKEN || !VRC_AUTH_COOKIE || !GROUP_ID) {
  console.error('❌ Missing DISCORD_TOKEN, VRC_AUTH_COOKIE or GROUP_ID in .env');
  process.exit(1);
}

const client = new Client({
  intents: [ IntentsBitField.Flags.Guilds ]
});

client.once(Events.ClientReady, async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // register slash command
  await client.application.commands.create(
    new SlashCommandBuilder()
      .setName('create-announcement')
      .setDescription('Open a form to craft a new announcement')
      .toJSON()
  );
});


// 1) Slash command → show modal immediately
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isCommand() || interaction.commandName !== 'create-announcement')
    return;

  // build the modal
  const modal = new ModalBuilder()
    .setCustomId('announceModal')
    .setTitle('New Announcement');

  const titleInput = new TextInputBuilder()
    .setCustomId('title')
    .setLabel('Title')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const descInput = new TextInputBuilder()
    .setCustomId('description')
    .setLabel('Description')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  const scopeInput = new TextInputBuilder()
    .setCustomId('scope')
    .setLabel('Scope (public or group)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('public or group')
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(titleInput),
    new ActionRowBuilder().addComponents(descInput),
    new ActionRowBuilder().addComponents(scopeInput)
  );

  // **SHOW** the modal as the immediate response
  await interaction.showModal(modal);
});


// 2) Modal submit → check role & process
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isModalSubmit() || interaction.customId !== 'announceModal')
    return;

  // fetch member & check role
  let member;
  try {
    const guild  = await client.guilds.fetch(interaction.guildId);
    member        = await guild.members.fetch(interaction.user.id);
  } catch {
    // nothing
  }
  if (!member || !member.roles.cache.some(r => r.name === ALLOWED_ROLE)) {
    return interaction.reply({
      content: '🚫 You need the Announcer role.',
      flags: InteractionResponseFlags.Ephemeral
    });
  }

  // grab inputs
  const title       = interaction.fields.getTextInputValue('title');
  const description = interaction.fields.getTextInputValue('description');
  const scope       = interaction.fields.getTextInputValue('scope').toLowerCase();

  // if group, post to VRChat
  if (scope === 'group') {
    try {
      const res = await fetch(
        `https://api.vrchat.cloud/api/1/groups/${GROUP_ID}/announcement`,
        {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Cookie':        `auth=${VRC_AUTH_COOKIE}`,
            'User-Agent':    'VRC-Discord-Bot/1.0 (https://github.com/yourrepo; your_email@example.com)'
          },
          body: JSON.stringify({ title, text: description })
        }
      );
      if (!res.ok) {
        const errTxt = await res.text();
        throw new Error(errTxt || res.status);
      }
      return interaction.reply({
        content: `✅ Posted to VRChat group:\n**${title}**\n${description}`
      });
    } catch (err) {
      console.error('VRChat API error:', err);
      return interaction.reply({
        content: `❌ VRChat post failed: ${err.message}`,
        flags: InteractionResponseFlags.Ephemeral
      });
    }
  }

  // otherwise public → post in channel
  await interaction.reply({
    content: `📣 **${title}**\n${description}`
  });
});

client.login(DISCORD_TOKEN);
