import { CLASS_IDS } from '@tbca/game-core';
import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

/** Slash-Commands für Spieler. */
export const playerCommand = new SlashCommandBuilder()
  .setName('tbca')
  .setDescription('TurnBased Cyber Arena')
  .setDMPermission(false)
  .addSubcommand((s) =>
    s
      .setName('registrieren')
      .setDescription('Charakter für diese Season anlegen')
      .addStringOption((o) =>
        o
          .setName('name')
          .setDescription('Charaktername (3–20 Zeichen)')
          .setRequired(true)
          .setMaxLength(20),
      )
      .addStringOption((o) =>
        o
          .setName('klasse')
          .setDescription('Startklasse (jederzeit wechselbar)')
          .setRequired(true)
          .addChoices(
            ...CLASS_IDS.map((id) => ({ name: id[0]!.toUpperCase() + id.slice(1), value: id })),
          ),
      ),
  )
  .addSubcommand((s) => s.setName('profil').setDescription('Level, XP und Credits anzeigen'))
  .addSubcommand((s) =>
    s
      .setName('kampf')
      .setDescription('Jemanden herausfordern (asynchron gegen die Momentaufnahme)')
      .addUserOption((o) => o.setName('gegner').setDescription('Gegner').setRequired(true))
      .addStringOption((o) =>
        o
          .setName('modus')
          .setDescription('Gewertet (mit Belohnung) oder Freundschaftskampf')
          .addChoices(
            { name: 'Gewertet', value: 'rated' },
            { name: 'Freundschaft', value: 'friendly' },
          ),
      ),
  );

/** Slash-Commands für Community-Admins (Server verwalten). */
export const adminCommand = new SlashCommandBuilder()
  .setName('tbca-admin')
  .setDescription('TBCA für diesen Server einrichten')
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((s) =>
    s.setName('einrichten').setDescription('Diesen Server als Community anlegen'),
  )
  .addSubcommand((s) =>
    s
      .setName('xp-kanal')
      .setDescription('Festlegen, ob Nachrichten in einem Kanal XP geben')
      .addChannelOption((o) =>
        o
          .setName('kanal')
          .setDescription('Kanal')
          .setRequired(true)
          .addChannelTypes(ChannelType.GuildText),
      )
      .addBooleanOption((o) => o.setName('aktiv').setDescription('XP geben?').setRequired(true)),
  );

export const allCommands = [playerCommand.toJSON(), adminCommand.toJSON()];
