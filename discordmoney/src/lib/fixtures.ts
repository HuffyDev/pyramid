import type { Server, User } from './types';

/** Fictional servers. None of these are real communities. */
export const SERVERS: Server[] = [
  {
    id: 'srv-pixel',
    name: 'Pixel Forge',
    discordId: '1182930475561203712',
    color: '#5865F2',
    members: 4812,
    channels: ['announcements', 'general', 'showcase', 'coin-talk'],
    announcementChannel: 'announcements',
  },
  {
    id: 'srv-midnight',
    name: 'Midnight Labs',
    discordId: '1093348812290183168',
    color: '#EB459E',
    members: 2290,
    channels: ['updates', 'lab-notes', 'general', 'alpha'],
    announcementChannel: 'updates',
  },
  {
    id: 'srv-frog',
    name: 'Frog Council',
    discordId: '1219904416630546432',
    color: '#23A55A',
    members: 9137,
    channels: ['council-news', 'pond', 'memes', 'votes'],
    announcementChannel: 'council-news',
  },
  {
    id: 'srv-orbit',
    name: 'Orbit Arcade',
    discordId: '1150276630184951808',
    color: '#F0B232',
    members: 3561,
    channels: ['news', 'high-scores', 'lobby', 'tournaments'],
    announcementChannel: 'news',
  },
  {
    id: 'srv-cozy',
    name: 'Cozy Builders',
    discordId: '1067712093318725632',
    color: '#00A8FC',
    members: 1874,
    channels: ['announcements', 'builds', 'help', 'hangout'],
    announcementChannel: 'announcements',
  },
  {
    id: 'srv-signal',
    name: 'Signal Room',
    discordId: '1247751802113736704',
    color: '#F23F43',
    members: 6420,
    channels: ['signals', 'briefing', 'general', 'off-topic'],
    announcementChannel: 'briefing',
  },
];

/** Fictional users with fictional Discord IDs and fictional base58-looking demo wallets. */
export const USERS: User[] = [
  {
    id: 'usr-nova',
    username: 'nova.dev',
    displayName: 'Nova',
    discordId: '804117730091237406',
    wallet: 'DemoNv7qK3xWp9rT2mYc8LhB4sJfE6aZuQ1nGdR5VtXo',
    color: '#5865F2',
    manages: ['srv-pixel', 'srv-orbit'],
  },
  {
    id: 'usr-minty',
    username: 'mintyfresh',
    displayName: 'Minty',
    discordId: '719306642187030558',
    wallet: 'DemoMf4hT8cVb2nQx6WrK9pLs3JdZ7eYgA5uN1oRkBiC',
    color: '#23A55A',
    manages: ['srv-cozy'],
  },
  {
    id: 'usr-hex',
    username: 'hexhound',
    displayName: 'Hexhound',
    discordId: '651094482230411274',
    wallet: 'DemoHx2pR7wLm5kV9cTq3BnYz8JsF4dGa6EuX1hNoWiK',
    color: '#EB459E',
    manages: ['srv-midnight'],
  },
  {
    id: 'usr-lunar',
    username: 'lunarpip',
    displayName: 'Lunar Pip',
    discordId: '922480157733056512',
    wallet: 'DemoLp8sW3zQn6tRb1yKv4XcM9fHj2eDg7aUo5iNkTpE',
    color: '#00A8FC',
    manages: [],
  },
  {
    id: 'usr-quiet',
    username: 'quietbyte',
    displayName: 'Quiet Byte',
    discordId: '1011845502634639420',
    wallet: 'DemoQb5mY1xKt8wPc4nRz7LhV2sGj9dFa3eTu6oBkNiW',
    color: '#80848E',
    manages: [],
  },
  {
    id: 'usr-raid',
    username: 'raidleader',
    displayName: 'Raid Leader',
    discordId: '588231940618338305',
    wallet: 'DemoRl3nB9vXq6cTm2wKy5PzH8sJf1dGe4aLu7oNkYiR',
    color: '#F0B232',
    manages: ['srv-frog'],
  },
  {
    id: 'usr-salty',
    username: 'saltypixel',
    displayName: 'Salty Pixel',
    discordId: '770392816605085716',
    wallet: 'DemoSp6kT2zWn9qVb4xRc7LmY1hJf3sGd8aEu5oNiBtK',
    color: '#F23F43',
    manages: [],
  },
  {
    id: 'usr-owl',
    username: 'owlmod',
    displayName: 'Owl Mod',
    discordId: '867520039115796501',
    wallet: 'DemoOm9wR4xKt1nPc7mVb2zQs5LhY8jFd3gGe6aUoNiT',
    color: '#949CF7',
    manages: ['srv-signal'],
  },
];

export const DEFAULT_USER_ID = 'usr-nova';

export const userById = (id: string | null | undefined) => USERS.find((u) => u.id === id);
export const serverById = (id: string | null | undefined) => SERVERS.find((s) => s.id === id);
export const userByWallet = (w: string) => USERS.find((u) => u.wallet === w);

/** Labelled sample exchange rate for $DCM buybacks. Not a market price. */
export const SAMPLE_DCM_PER_SOL = 250_000;
export const SAMPLE_DCM_SUPPLY = 1_000_000_000;
/** $DCM contract address (Solana) and official X account, supplied by the project. */
export const DCM_CA = 'CAV5LevZc5AonWsgRKEqjgEqXnptXFgudt52Mrxgpump';
export const DCM_X_URL = 'https://x.com/Payondiscord';
export const DCM_PUMP_URL = `https://pump.fun/coin/${DCM_CA}`;
export const BOT_NAME = 'MoneyBot';
