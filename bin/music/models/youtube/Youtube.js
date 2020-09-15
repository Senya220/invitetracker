"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Youtube = void 0;
const ytdl_core_1 = __importDefault(require("ytdl-core"));
const types_1 = require("../../../types");
const MusicPlatform_1 = require("../MusicPlatform");
const YoutubeMusicItem_1 = require("./YoutubeMusicItem");
class Youtube extends MusicPlatform_1.MusicPlatform {
    constructor(client) {
        super(client);
        this.supportsRewind = true;
        this.supportsSeek = true;
        this.supportsLyrics = true;
        this.supportsSearch = true;
    }
    isPlatformUrl(url) {
        if (!url) {
            return false;
        }
        return url.startsWith('https://youtube.com/');
    }
    getType() {
        return types_1.MusicPlatformType.YouTube;
    }
    async getByLink(link) {
        const videoInfo = await ytdl_core_1.default.getInfo(link);
        if (!videoInfo) {
            throw new Error('INVALID_PLATFORM_URL');
        }
        return new YoutubeMusicItem_1.YoutubeMusicItem(this, {
            id: videoInfo.video_id,
            title: videoInfo.player_response.videoDetails.title,
            link: `https://youtube.com/watch?v=${videoInfo.video_id}`,
            imageUrl: videoInfo.thumbnail_url,
            channel: videoInfo.author.name,
            duration: Number(videoInfo.length_seconds)
        });
    }
    async search(searchTerm, maxResults = 10) {
        const tracks = await this.service.resolveTracks(`ytsearch:${searchTerm}`);
        return tracks.slice(0, maxResults).map((track) => {
            const id = track.info.identifier;
            return new YoutubeMusicItem_1.YoutubeMusicItem(this, {
                id: id,
                title: track.info.title,
                link: `https://youtube.com/watch?v=${id}`,
                imageUrl: `https://img.youtube.com/vi/${id}/default.jpg`,
                channel: track.info.author,
                duration: track.info.length / 1000
            });
        });
    }
    parseYoutubeDuration(PT) {
        let durationInSec = 0;
        const matches = PT.match(/P(?:(\d*)Y)?(?:(\d*)M)?(?:(\d*)W)?(?:(\d*)D)?T(?:(\d*)H)?(?:(\d*)M)?(?:(\d*)S)?/i);
        const parts = [
            {
                // years
                pos: 1,
                multiplier: 86400 * 365
            },
            {
                // months
                pos: 2,
                multiplier: 86400 * 30
            },
            {
                // weeks
                pos: 3,
                multiplier: 604800
            },
            {
                // days
                pos: 4,
                multiplier: 86400
            },
            {
                // hours
                pos: 5,
                multiplier: 3600
            },
            {
                // minutes
                pos: 6,
                multiplier: 60
            },
            {
                // seconds
                pos: 7,
                multiplier: 1
            }
        ];
        for (var i = 0; i < parts.length; i++) {
            if (typeof matches[parts[i].pos] !== 'undefined') {
                durationInSec += parseInt(matches[parts[i].pos], 10) * parts[i].multiplier;
            }
        }
        return durationInSec;
    }
}
exports.Youtube = Youtube;
//# sourceMappingURL=Youtube.js.map