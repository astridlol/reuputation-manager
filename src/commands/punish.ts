import {
	ApplicationCommandOptionType,
	CommandInteraction,
	EmbedBuilder,
	GuildMember,
	GuildTextBasedChannel,
	bold,
	userMention
} from 'discord.js';
import { Discord, Slash, SlashChoice, SlashOption } from 'discordx';
import { client, prisma } from '..';
import Colors from '../constants/Colors';
import { Punishments } from '@prisma/client';
import { env } from '../env/server';
import { executePunishment } from '../lib/Punishments';

interface PunishmentInfo {
	reason: string;
	points: number;
}

const punishments: Record<string, PunishmentInfo> = {
	nonEngPhrases: {
		reason: 'Multiple non-English phrases',
		points: 1
	},
	miniModPinging: {
		reason: 'Mini-modding when pinging a mod is a better option',
		points: 1
	},
	excessiveCapsLock: {
		reason: 'Excessive use of caps-lock across multiple longer messages',
		points: 1
	},
	wrongChannel: {
		reason: 'Using the wrong channel',
		points: 2
	},
	instigating: {
		reason: 'Instigating Arguments',
		points: 20
	},
	selfPromotion: {
		reason: 'Self-promotion in the incorrect channel',
		points: 2
	},
	nsfwUsername: {
		reason: 'NSFW username',
		points: 5
	},
	earRapeVC: {
		reason: 'Ear-rape in VC',
		points: 5
	},
	textSpam: {
		reason: 'Text spam',
		points: 5
	},
	nsfwProfile: {
		reason: 'NSFW profile picture/nickname/banner/message',
		points: 10
	},
	plagiarism: {
		reason: 'Plagiarism',
		points: 10
	},
	hateComments: {
		reason: 'Racist/Sexist/LGBTQ-phobic comments',
		points: 10
	},
	derogatoryTerms: {
		reason: 'Derogatory terms',
		points: 10
	},
	nsfwContent: {
		reason: 'NSFW image/video',
		points: 30
	},
	harmfulLink: {
		reason: 'Harmful link',
		points: 30
	},
	doxxing: {
		reason: 'Doxxing',
		points: 30
	},
	massPinging: {
		reason: 'Mass-pinging',
		points: 30
	}
};

const slashOpts = Object.keys(punishments).map((punishment) => {
	return {
		name: punishments[punishment].reason,
		value: punishment
	};
});

@Discord()
class Punish {
	async sendLog(punishment: Punishments) {
		const embed = new EmbedBuilder()
			.setColor(Colors.red)
			.setTitle('Member Punished')
			.setFields([
				{
					name: 'Punishment ID',
					value: punishment.id
				},
				{
					name: 'Reason',
					value: punishment.reason
				},
				{
					name: 'User',
					value: `${userMention(punishment.member)}`,
					inline: true
				},
				{
					name: 'Moderator',
					value: `${userMention(punishment.moderator)}`,
					inline: true
				}
			]);

		const channel = (await client.channels.fetch(env.LOGS_CHANNEL)) as GuildTextBasedChannel;
		await channel.send({
			embeds: [embed]
		});
	}

	@Slash({ description: 'Punish a member', defaultMemberPermissions: 'ModerateMembers' })
	async punish(
		@SlashOption({
			description: 'The member',
			name: 'member',
			required: true,
			type: ApplicationCommandOptionType.User
		})
		user: GuildMember,
		@SlashChoice(...slashOpts)
		@SlashOption({
			description: 'The punishment reason',
			name: 'reason',
			required: true,
			type: ApplicationCommandOptionType.String
		})
		reason: string,
		interaction: CommandInteraction
	) {
		const punishmentInfo = punishments[reason];

		await interaction.deferReply();

		const where = {
			id: user.id
		};

		let member = await prisma.member.findUnique({
			where
		});
		if (!member) {
			member = await prisma.member.create({
				data: {
					id: user.id
				}
			});
		}

		await prisma.member.update({
			where,
			data: {
				points: {
					increment: punishmentInfo.points
				}
			}
		});

		const punishment = await prisma.punishments.create({
			data: {
				member: user.id,
				moderator: interaction.user.id,
				reason: punishmentInfo.reason
			}
		});

		const embed = new EmbedBuilder()
			.setColor(Colors.purple)
			.setTitle('Punishment issued')
			.setDescription(`You received a punishment in ${bold(interaction.guild.name)}.`)
			.setFields([
				{
					name: 'Reason',
					value: punishmentInfo.reason
				},
				{
					name: 'Punishment ID',
					value: punishment.id
				}
			])
			.setFooter({
				text: `You currently have ${punishmentInfo.points + member.points} points.`
			});

		let moderatorMsg = `Punished ${user.id} for ${punishmentInfo.reason} (${punishmentInfo.points} points)`;

		try {
			await user.send({
				embeds: [embed]
			});
			interaction.editReply({
				content: moderatorMsg
			});
		} catch (err) {
			moderatorMsg += ' [User had DMs disabled]';
			interaction.editReply({
				content: moderatorMsg
			});
		}

		this.sendLog(punishment);

		executePunishment(user);
	}
}
