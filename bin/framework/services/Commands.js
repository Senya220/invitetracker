"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandsService = void 0;
const node_1 = require("@sentry/node");
const chalk_1 = __importDefault(require("chalk"));
const eris_1 = require("eris");
const fs_1 = require("fs");
const i18n_1 = __importDefault(require("i18n"));
const path_1 = require("path");
const settings_1 = require("../../settings");
const types_1 = require("../../types");
const resolvers_1 = require("../resolvers");
const Service_1 = require("./Service");
const CMD_DIRS = [
    path_1.resolve(__dirname, '../commands'),
    path_1.resolve(__dirname, '../../invites/commands'),
    path_1.resolve(__dirname, '../../moderation/commands'),
    path_1.resolve(__dirname, '../../music/commands'),
    path_1.resolve(__dirname, '../../management/commands')
];
const ID_REGEX = /^(?:<@!?)?(\d+)>? ?(.*)$/;
const RATE_LIMIT = 1; // max commands per second
const COOLDOWN = 5; // in seconds
const readDir = async (dir) => {
    return new Promise((res, reject) => {
        fs_1.readdir(dir, (err, files) => {
            if (err) {
                reject(err);
            }
            else {
                res(files);
            }
        });
    });
};
class CommandsService extends Service_1.IMService {
    constructor() {
        super(...arguments);
        this.commands = [];
        this.cmdMap = new Map();
        this.commandCalls = new Map();
    }
    async init() {
        console.log(`Loading commands...`);
        // Load all commands
        const loadRecursive = async (dir) => {
            const fileNames = await readDir(dir);
            for (const fileName of fileNames) {
                const file = dir + '/' + fileName;
                if (fs_1.statSync(file).isDirectory()) {
                    await loadRecursive(file);
                    continue;
                }
                if (!fileName.endsWith('.js')) {
                    continue;
                }
                const clazz = require(file);
                if (clazz.default) {
                    const constr = clazz.default;
                    const parent = Object.getPrototypeOf(constr);
                    if (!parent || parent.name !== 'Command') {
                        continue;
                    }
                    const inst = new constr(this.client);
                    this.commands.push(inst);
                    // Register main commnad name
                    if (this.cmdMap.has(inst.name.toLowerCase())) {
                        console.error(`Duplicate command name ${inst.name}`);
                        process.exit(1);
                    }
                    this.cmdMap.set(inst.name.toLowerCase(), inst);
                    // Register aliases
                    inst.aliases.forEach((a) => {
                        if (this.cmdMap.has(a.toLowerCase())) {
                            console.error(`Duplicate command alias ${a}`);
                            process.exit(1);
                        }
                        this.cmdMap.set(a.toLowerCase(), inst);
                    });
                    console.log(`Loaded ${chalk_1.default.blue(inst.name)} from ${chalk_1.default.gray(path_1.relative(process.cwd(), file))}`);
                }
            }
        };
        await Promise.all(CMD_DIRS.map((dir) => loadRecursive(dir)));
        console.log(`Loaded ${chalk_1.default.blue(this.commands.length)} commands!`);
    }
    async onClientReady() {
        // Attach events after the bot is ready
        this.client.on('messageCreate', this.onMessage.bind(this));
        await super.onClientReady();
    }
    async onMessage(message) {
        // Skip if this is our own message, bot message or empty messages
        if (message.author.id === this.client.user.id || message.author.bot || !message.content.length) {
            return;
        }
        const start = Date.now();
        const channel = message.channel;
        const guild = channel.guild;
        if (guild) {
            // Check if this guild is disabled due to the pro bot
            if (this.client.disabledGuilds.has(guild.id) &&
                !message.content.startsWith(`<@${this.client.user.id}>`) &&
                !message.content.startsWith(`<@!${this.client.user.id}>`)) {
                return;
            }
        }
        // Save some constant stuff
        let content = message.content.trim();
        const sets = guild ? await this.client.cache.guilds.get(guild.id) : Object.assign({}, settings_1.guildDefaultSettings);
        const lang = sets.lang;
        const t = (key, replacements) => i18n_1.default.__({ locale: lang, phrase: key }, replacements);
        // Check if we're executing the command in a valid channel
        if (sets.channels && sets.channels.length) {
            if (!sets.channels.includes(message.channel.id)) {
                return;
            }
        }
        if (sets.ignoredChannels && sets.ignoredChannels.length) {
            if (sets.ignoredChannels.includes(message.channel.id)) {
                return;
            }
        }
        // Process prefix first so we can use any possible prefixes
        if (content.startsWith(sets.prefix)) {
            content = content.substring(sets.prefix.length).trim();
        }
        else if (ID_REGEX.test(content)) {
            const matches = content.match(ID_REGEX);
            if (matches[1] !== this.client.user.id) {
                return;
            }
            content = matches[2].trim();
            if (content === '') {
                // If the content is an empty string then the user just mentioned the
                // bot, so we'll print the prefix to help them out.
                await this.client.msg.sendReply(message, t('bot.mentionHelp', {
                    prefix: sets.prefix
                }));
                return;
            }
        }
        else if (guild) {
            // Exit if we're in guild chat and we can't recognize a command
            return;
        }
        const splits = content.split(' ');
        // Find the command
        const cmd = this.cmdMap.get(splits[0].toLowerCase());
        // Command not found
        if (!cmd) {
            // Send message to InviteManager Guild if it's a DM
            if (message.channel instanceof eris_1.PrivateChannel) {
                const user = message.author;
                const oldMessages = await message.channel.getMessages(2);
                const isInitialMessage = oldMessages.length <= 1;
                if (isInitialMessage) {
                    const initialMessage = `Hi there, thanks for writing me!\n\n` +
                        `To invite me to your own server, just click here: https://invitemanager.co/add-bot?origin=initial-dm \n\n` +
                        `If you need help, you can either write me here (try "help") or join our discord support server: ` +
                        `https://discord.gg/Z7rtDpe.\n\nHave a good day!`;
                    const embed = this.client.msg.createEmbed({
                        description: initialMessage
                    });
                    await this.client.msg.sendEmbed(await user.getDMChannel(), embed);
                }
                /* TODO: Send DMs
                this.client.rabbitmq.sendCommandToGuild(this.client.config.bot.dm.guild, {
                    id: message.id,
                    cmd: ShardCommand.USER_DM,
                    user: user,
                    guildId: this.client.config.bot.dm.guild,
                    channelId: this.client.config.bot.dm.channel,
                    isInitial: isInitialMessage,
                    message: message.content
                });
                */
            }
            return;
        }
        // Command not allowed in DM
        if (cmd.guildOnly && !guild) {
            return;
        }
        // Ignore rate limiting on sudo messages
        if (!message.__sudo) {
            const now = new Date().getTime();
            let lastCall = this.commandCalls.get(message.author.id);
            if (!lastCall) {
                lastCall = {
                    last: now,
                    warned: false
                };
                this.commandCalls.set(message.author.id, lastCall);
            }
            else if (now - lastCall.last < (1 / RATE_LIMIT) * 1000) {
                // Only warn the first time we hit the rate limit
                if (!lastCall.warned) {
                    lastCall.warned = true;
                    lastCall.last = now + COOLDOWN * 1000;
                    await this.client.msg.sendReply(message, t('permissions.rateLimit', {
                        cooldown: COOLDOWN.toString()
                    }));
                }
                // but always exit when hitting the limit
                return;
            }
            else if (lastCall.warned) {
                lastCall.warned = false;
            }
            // Update last command execution time
            lastCall.last = now;
        }
        const isPremium = guild ? await this.client.cache.premium.get(guild.id) : false;
        if (!isPremium && cmd.premiumOnly) {
            await this.client.msg.sendReply(message, t('permissions.premiumOnly'));
            return;
        }
        let me = undefined;
        // Guild only stuff
        if (guild) {
            // Check permissions for guilds
            let member = message.member;
            if (!member) {
                member = guild.members.get(message.author.id);
            }
            if (!member) {
                member = await guild.getRESTMember(message.author.id);
            }
            if (!member) {
                console.error(`Could not get member ${message.author.id} for ${guild.id}`);
                await this.client.msg.sendReply(message, t('permissions.memberError'));
                return;
            }
            // Always allow admins
            if (!member.permission.has(types_1.GuildPermission.ADMINISTRATOR) && guild.ownerID !== member.id) {
                const perms = (await this.client.cache.permissions.get(guild.id))[cmd.name];
                if (perms && perms.length > 0) {
                    // Check that we have at least one of the required roles
                    if (!perms.some((p) => member.roles.indexOf(p) >= 0)) {
                        await this.client.msg.sendReply(message, t('permissions.role', {
                            roles: perms.map((p) => `<@&${p}>`).join(', ')
                        }));
                        return;
                    }
                }
                else if (cmd.strict) {
                    // Allow commands that require no roles, if strict is not true
                    await this.client.msg.sendReply(message, t('permissions.adminOnly'));
                    return;
                }
            }
            // Add self context
            me = guild.members.get(this.client.user.id);
            if (!me) {
                me = await guild.getRESTMember(this.client.user.id);
            }
            // Check command permissions
            const missingPerms = cmd.botPermissions.filter((p) => !channel.permissionsOf(this.client.user.id).has(p));
            if (missingPerms.length > 0) {
                await this.client.msg.sendReply(message, t(`permissions.missing`, {
                    channel: `<#${channel.id}>`,
                    permissions: missingPerms.map((p) => '`' + t(`permissions.${p}`) + '`').join(', ')
                }));
                return;
            }
        }
        const context = {
            guild,
            me,
            t,
            settings: sets,
            isPremium
        };
        // Format arguments
        const rawArgs = [];
        let quote = false;
        let acc = '';
        for (let j = 1; j < splits.length; j++) {
            const split = splits[j];
            // Skip empty strings
            if (split.length === 0) {
                continue;
            }
            // Check if this is a new quote starting
            if (!quote && split.startsWith(`"`)) {
                quote = true;
                acc = '';
            }
            // Check if this is a quote ending
            if (split.endsWith(`"`)) {
                quote = false;
                acc += ' ' + split.substring(0, split.length - 1);
                rawArgs.push(acc.substring(2));
                continue;
            }
            // Add to arguments according to quote mode
            if (quote) {
                acc += ' ' + split;
            }
            else {
                rawArgs.push(split);
            }
        }
        // Resolve flags
        const flags = {};
        while (rawArgs.length > 0) {
            const rawArg = rawArgs[0];
            // Exit once we reach the first non-flag
            if (!rawArg.startsWith('-')) {
                break;
            }
            const flagSplits = rawArg.split('=');
            const isShort = !flagSplits[0].startsWith('--');
            const name = flagSplits[0].replace(/-/gi, '');
            const flag = cmd.flags.find((f) => (isShort ? f.short === name : f.name === name));
            // Exit if this is not a flag
            if (!flag) {
                break;
            }
            const resolver = cmd.flagResolvers.get(flag.name);
            const rawVal = isShort ? rawArgs[1] : flagSplits[1];
            const hasVal = typeof rawVal !== 'undefined';
            const skipVal = resolver instanceof resolvers_1.BooleanResolver;
            let val = true;
            if (!skipVal) {
                if (!hasVal) {
                    await this.client.msg.sendReply(message, `Missing required value for flag \`${flag.name}\`.\n` +
                        `\`${cmd.usage.replace('{prefix}', sets.prefix)}\`\n` +
                        resolver.getHelp(context));
                    return;
                }
                else {
                    try {
                        val = await resolver.resolve(rawVal, context, []);
                    }
                    catch (e) {
                        await this.client.msg.sendReply(message, `Invalid value for \`${flag.name}\`: ${e.message}\n` +
                            `\`${cmd.usage.replace('{prefix}', sets.prefix)}\`\n` +
                            resolver.getHelp(context));
                        return;
                    }
                }
            }
            flags[flag.name] = val;
            rawArgs.splice(0, isShort && !skipVal ? 2 : 1);
        }
        // Resolve arguments
        const args = [];
        let i = 0;
        for (const arg of cmd.args) {
            const resolver = cmd.resolvers[i];
            let rawVal = rawArgs[i];
            if (arg.rest) {
                // Since we are concatinating all arguments we have to restore quotes where required
                rawVal = rawArgs
                    .slice(i)
                    .map((a) => (a.indexOf(' ') > 0 ? `"${a}"` : a))
                    .join(' ');
                if (rawVal.length === 0) {
                    rawVal = undefined;
                }
            }
            try {
                const val = await resolver.resolve(rawVal, context, args);
                if (typeof val === typeof undefined && arg.required) {
                    await this.client.msg.sendReply(message, t('resolvers.missingRequired', {
                        name: arg.name,
                        usage: '`' + cmd.usage.replace('{prefix}', sets.prefix) + '`',
                        help: resolver.getHelp(context, args)
                    }));
                    return;
                }
                args.push(val);
            }
            catch (e) {
                await this.client.msg.sendReply(message, t('resolvers.invalid', {
                    name: arg.name,
                    usage: '`' + cmd.usage.replace('{prefix}', sets.prefix) + '`',
                    arg: arg.name,
                    error: e.message,
                    help: resolver.getHelp(context, args)
                }));
                return;
            }
            i++;
        }
        this.client.stats.cmdProcessed++;
        // Run command
        let error = null;
        try {
            await cmd.action(message, args, flags, context);
        }
        catch (e) {
            // Save the error for later so error handling doesn't count to command process time
            error = e;
        }
        const execTime = Date.now() - start;
        if (error) {
            this.client.stats.cmdErrors++;
            console.error(error);
            node_1.withScope((scope) => {
                if (guild) {
                    scope.setUser({ id: guild.id });
                }
                scope.setTag('command', cmd.name);
                scope.setExtra('channel', channel.id);
                scope.setExtra('message', message.content);
                node_1.captureException(error);
            });
            if (guild) {
                this.client.db.saveIncident(guild, {
                    id: null,
                    guildId: guild.id,
                    error: error.message,
                    details: {
                        command: cmd.name,
                        author: message.author.id,
                        message: message.content
                    }
                });
            }
            await this.client.msg.sendReply(message, t('cmd.error', {
                error: error.message
            }));
        }
        // Ignore messages that are not in guild chat or from disabled guilds
        if (guild && !this.client.disabledGuilds.has(guild.id)) {
            // We have to add the guild and members too, in case our DB does not have them yet
            this.client.db.saveCommandUsage(guild, message.author, {
                id: null,
                guildId: guild.id,
                memberId: message.author.id,
                command: cmd.name,
                args: args.join(' '),
                errored: error !== null,
                time: execTime
            });
        }
    }
}
exports.CommandsService = CommandsService;
//# sourceMappingURL=Commands.js.map