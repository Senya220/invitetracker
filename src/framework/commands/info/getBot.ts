import { Message } from 'eris';

import { IMClient } from '../../../client';
import { BotCommand, CommandGroup } from '../../../types';
import { Command, Context } from '../Command';

export default class extends Command {
	public constructor(client: IMClient) {
		super(client, {
			name: BotCommand.getBot,
			aliases: ['get-bot', 'invite-bot', 'inviteBot'],
			group: CommandGroup.Info,
			defaultAdminOnly: false,
			guildOnly: false
		});
	}

	public async action(message: Message, args: any[], flags: {}, { guild, t }: Context): Promise<any> {
		const embed = this.createEmbed();

		const params = [];
		params.push(`origin=getbot`);
		params.push(`user=${message.author.id}`);
		if (guild) {
			params.push(`guild=${guild.id}`);
		}

		embed.description = `[Add InviteTracker to your server!]` + `(https://discord.com/api/oauth2/authorize?client_id=746396844946489504&permissions=8&scope=bot)`;

		return this.sendReply(message, embed);
	}
}
