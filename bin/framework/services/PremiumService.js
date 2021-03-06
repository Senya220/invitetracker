"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PremiumService = void 0;
const axios_1 = __importDefault(require("axios"));
const moment_1 = __importDefault(require("moment"));
const types_1 = require("../../types");
const Service_1 = require("./Service");
class PremiumService extends Service_1.IMService {
    async onClientReady() {
        if (this.client.type === types_1.BotType.pro) {
            setInterval(() => this.checkGuilds(), 1 * 60 * 60 * 1000);
        }
        await super.onClientReady();
    }
    async checkGuilds() {
        if (this.client.type !== types_1.BotType.pro) {
            return;
        }
        console.log('Checking all guilds for premium...');
        for (const guild of this.client.guilds.values()) {
            let premium = await this.client.cache.premium._get(guild.id);
            if (!premium) {
                // Let's try and see if this guild had pro before, and if maybe
                // the member renewed it, but it didn't update.
                const oldPremium = await this.client.db.getPremiumSubscriptionGuildForGuild(guild.id, false);
                if (oldPremium) {
                    await this.checkPatreon(oldPremium.memberId);
                    premium = await this.client.cache.premium._get(guild.id);
                }
                if (!premium) {
                    const dmChannel = await this.client.getDMChannel(guild.ownerID);
                    await dmChannel
                        .createMessage('Hi!' +
                        `Thanks for inviting me to your server \`${guild.name}\`!\n\n` +
                        'I am the pro version of InviteManager, and only available to people ' +
                        'that support me on Patreon with the pro tier.\n\n' +
                        'To purchase the pro tier visit https://www.patreon.com/invitemanager\n\n' +
                        'If you purchased premium run `!premium check` and then `!premium activate` in the server\n\n' +
                        'I will be leaving your server soon, thanks for having me!')
                        .catch(() => undefined);
                    const onTimeout = async () => {
                        // Check one last time before leaving
                        if (await this.client.cache.premium._get(guild.id)) {
                            return;
                        }
                        await guild.leave();
                    };
                    setTimeout(onTimeout, 3 * 60 * 1000);
                }
            }
        }
    }
    async checkPatreon(userId) {
        const res = await axios_1.default
            .get(`https://api.invitemanager.gg/patreon/check/?userId=${userId}`, {
            auth: this.client.config.bot.apiAuth
        })
            .catch(() => undefined);
        if (!res) {
            return 'not_found';
        }
        else if (res.data.last_charge_status !== 'Paid') {
            return 'declined';
        }
        else if (res.data.patron_status !== 'active_patron') {
            return 'paused';
        }
        else {
            const day = moment_1.default(res.data.last_charge_date).date();
            const validUntil = moment_1.default().add(1, 'month').date(day).add(1, 'day');
            const amount = res.data.currently_entitled_amount_cents / 100;
            const maxGuilds = 5;
            const subs = await this.client.db.getPremiumSubscriptionsForMember(userId, false);
            const sub = subs.find((s) => s.amount === amount && s.maxGuilds === maxGuilds && s.isPatreon === true);
            if (sub) {
                sub.validUntil = validUntil.toDate();
                await this.client.db.savePremiumSubscription(sub);
            }
            else {
                await this.client.db.savePremiumSubscription({
                    memberId: userId,
                    validUntil: validUntil.toDate(),
                    amount,
                    maxGuilds,
                    isFreeTier: false,
                    isPatreon: true,
                    isStaff: false,
                    reason: ''
                });
            }
            return validUntil;
        }
    }
}
exports.PremiumService = PremiumService;
//# sourceMappingURL=PremiumService.js.map