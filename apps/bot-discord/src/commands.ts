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
      .setName('dungeon')
      .setDescription('Dungeon-Run starten oder fortsetzen – mit Buttons')
      .addIntegerOption((o) =>
        o
          .setName('injektoren')
          .setDescription('Heil-Injektoren beim Start mitnehmen')
          .setMinValue(0)
          .setMaxValue(3),
      )
      .addBooleanOption((o) =>
        o.setName('backup-chip').setDescription('Backup-Chip beim Start einsetzen'),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('liga')
      .setDescription('Rating, Platzierung und nächster Liga-Spieltag – mit Buttons'),
  )
  .addSubcommand((s) => s.setName('team').setDescription('Deine Teams anzeigen'))
  .addSubcommand((s) =>
    s
      .setName('team-kampf')
      .setDescription('Mit deinem Team ein anderes Team herausfordern')
      .addStringOption((o) =>
        o
          .setName('gegner')
          .setDescription('Kürzel des Gegner-Teams')
          .setRequired(true)
          .setMinLength(2)
          .setMaxLength(5),
      )
      .addIntegerOption((o) =>
        o
          .setName('groesse')
          .setDescription('2v2 oder 3v3')
          .setRequired(true)
          .addChoices({ name: '2v2', value: 2 }, { name: '3v3', value: 3 }),
      )
      .addStringOption((o) =>
        o
          .setName('modus')
          .setDescription('Gewertet oder Freundschaft')
          .addChoices(
            { name: 'Gewertet', value: 'rated' },
            { name: 'Freundschaft', value: 'friendly' },
          ),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('kampf')
      .setDescription('Jemanden herausfordern – der Kampf läuft, sobald er annimmt')
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
  )
  .addSubcommand((s) =>
    s
      .setName('liga-kanal')
      .setDescription('Kanal für Liga-Ankündigungen (Spieltage, Zyklusende) festlegen')
      .addChannelOption((o) =>
        o
          .setName('kanal')
          .setDescription('Kanal')
          .setRequired(true)
          .addChannelTypes(ChannelType.GuildText),
      )
      .addBooleanOption((o) =>
        o.setName('aktiv').setDescription('Ankündigungen senden?').setRequired(true),
      ),
  );

export const allCommands = [playerCommand.toJSON(), adminCommand.toJSON()];
