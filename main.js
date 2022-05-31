const { Sequelize, Op, Model, DataTypes, Transaction } = require('sequelize'),
    socks = require('@luminati-io/socksv5'),
    axios = require('axios'),
    sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
    { networkInterfaces } = require('os')

const FreeBitcoin = require('./freebitcoin.js');

const SAMETYPEREWARDBONUS = 'You can only have one bonus of the same type active at any time. Please wait for your current bonus to finish before activating another one';
const INCORRECTCAPTCHA = 'Captcha is incorrect or has expired. Please try again.';
const sequelize = new Sequelize({
    database: 'taphuoca_freebitcoin',
    username: 'taphuoca_freebitcoin',
    password: 'jx2eb4fccmy8HxQX',
    host: '103.200.22.212',
    port: 3306,
    dialect: 'mariadb',
    logging: false,
    dialectOptions: {
        useUTC: false, // for reading from database
    },
    timezone: '+07:00', // for writing to database
});

const Account = sequelize.define('accounts', {
    user_id: DataTypes.INTEGER,
    email: DataTypes.STRING,
    password: DataTypes.STRING,
    btc_address: DataTypes.STRING,
    fingerprint: DataTypes.STRING,
    fingerprint2: DataTypes.STRING,
    cookie: DataTypes.TEXT,
    use_proxy: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
    },
    no_captcha: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
    auto_captcha: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
    },
    last_roll: DataTypes.INTEGER.UNSIGNED,
    last_redem_reward_bonus: DataTypes.INTEGER.UNSIGNED,
    last_redem_free_btc_bonus: DataTypes.INTEGER.UNSIGNED
}, {
    sequelize,
    // don't forget to enable timestamps!
    timestamps: true
});
const Proxy = sequelize.define('proxies', {
    type: DataTypes.ENUM(['http', 'https', 'socks5']),
    host: DataTypes.STRING,
    port: DataTypes.INTEGER,
    username: DataTypes.STRING,
    password: DataTypes.STRING,
    proxy_ip: DataTypes.STRING,
}, {
    sequelize,
    // don't forget to enable timestamps!
    timestamps: true
});
Proxy.prototype.getPublicIp = async function() {
    console.log('Get Public Ip');
    let socksConfig = {
        proxyHost: this.getDataValue('host'),
        proxyPort: this.getDataValue('port'),
        auths: [socks.auth.UserPassword(this.getDataValue('username'), this.getDataValue('password'))]
    };
    let requestConfig = {
        baseURL: 'https://api.myip.com',
        proxy: false,
        httpsAgent: new socks.HttpsAgent(socksConfig),
        headers: {
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) coc_coc_browser/94.0.202 Chrome/88.0.4324.202 Safari/537.36'
        }
    };
    let request = axios.create(requestConfig);

    try {
        let response = await request.get('');
        let publicIp = response.data.ip;
        this.update({ 'proxy_ip': publicIp });
        return publicIp;
    } catch (error) {
        console.log('Get Public Ip Error', '' + error);
        await new Promise(r => setTimeout(r, this.countdown * 1000));
        return await this.getPublicIp();
    }

}
const History = sequelize.define('histories', {
    type: DataTypes.ENUM(['free_roll', 'redem_reward_bonus', 'redem_free_btc_bonus']),
    result: DataTypes.TEXT,
    by_ip: DataTypes.STRING,
    by_proxy: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
    },
}, {
    sequelize,
    // don't forget to enable timestamps!
    timestamps: true
});

Account.hasOne(Proxy);
Proxy.belongsTo(Account);

Account.hasMany(History);
Proxy.belongsTo(Account);

Proxy.hasMany(History);
History.belongsTo(Proxy);

Account.prototype.createInstance = async function() {
    console.log('Create Instance Freebitcoin');
    if (this.getDataValue('use_proxy')) {
        console.log('Getting proxy.');
        let proxy = await this.getProxy();
        this.freebitcoin = new FreeBitcoin(this.getDataValue('cookie'), proxy.dataValues, this.getDataValue('no_captcha'));
    } else {
        this.freebitcoin = new FreeBitcoin(this.getDataValue('cookie'), undefined, this.getDataValue('no_captcha'));
    }

    this.freebitcoin.autoSolveCaptcha(this.getDataValue('auto_captcha'));
    await this.freebitcoin.parseVariable();
    await this.freebitcoin.userStatsInitial();
    this.freebitcoin.setFingerprint(this.getDataValue('fingerprint'));
    this.freebitcoin.setFingerprint2(this.getDataValue('fingerprint2'));
    return this.freebitcoin;
}
Account.prototype.freeRollPlay = async function() {
    console.log('Start free roll');
    let freebitcoin = this.freebitcoin;
    while (true) {
        let free_roll_ip = '';
        let proxy = null;
        if (this.getDataValue('use_proxy')) {
            proxy = await this.getProxy();
            free_roll_ip = proxy.dataValues.proxy_ip;
        } else {
            free_roll_ip = [].concat(...Object.values(networkInterfaces()))
            .filter(details => details.family === 'IPv4' && !details.internal)
            .pop().address;
        }

        let last_roll = this.getDataValue('last_roll');
        // Free roll play
        let time_to_free_roll = (last_roll + 60 * 60 - Math.floor(Date.now() / 1000) >= 0) ? last_roll + 60 * 60 - Math.floor(Date.now() / 1000) : 0;
        console.log('wait', time_to_free_roll, 'seconds to roll');
        await sleep(time_to_free_roll * 1000);
        let free_roll_result = await freebitcoin.freeRollPlay();

        let history = await this.createHistory({
            type: 'free_roll',
            result: free_roll_result,
            by_ip: free_roll_ip,
            by_proxy: this.getDataValue('use_proxy')
        });
        if (this.getDataValue('use_proxy')) {
            history.setProxy(proxy);
        }

        let free_roll_result_split = free_roll_result.split(':');

        while (free_roll_result_split.length > 1 && free_roll_result_split[0] !== 's') {
            if (free_roll_result_split[0] === 'e') {
                if (free_roll_result_split[1] === INCORRECTCAPTCHA) {}
            }
            free_roll_result = await freebitcoin.freeRollPlay();
            free_roll_result_split = free_roll_result.split(':');

            history = await this.createHistory({
                type: 'free_roll',
                result: free_roll_result,
                by_ip: free_roll_ip,
                by_proxy: this.getDataValue('use_proxy')
            }).catch(error => console.log('Create history error', error));
            if (this.getDataValue('use_proxy')) {
                history.setProxy(proxy);
            }

        }
        console.log('Number:', free_roll_result_split[1]);
        console.log('Value:', free_roll_result_split[3]);
        console.log('Current balance:', free_roll_result_split[2]);
        await this.update({ 'last_roll': Math.floor(Date.now() / 1000) }).catch(error => console.log('Update last roll error', error));
    }
}
Account.prototype.redemRewardPoints = async function() {
    console.log('Start redem Reward Points');
    let freebitcoin = this.freebitcoin;
    while (true) {
        let last_redem_reward_bonus = this.getDataValue('last_redem_reward_bonus');
        // Redem reward points bonus
        let countdown = last_redem_reward_bonus + 24 * 60 * 60 - Math.floor(Date.now() / 1000);
        if (countdown > 0) {
            console.log('wait', countdown, 'seconds to redem rewards points');
            await sleep(countdown * 1000);
        }

        let current_ip = '';
        let proxy = null;
        if (this.getDataValue('use_proxy')) {
            proxy = await this.getProxy();
            current_ip = proxy.dataValues.proxy_ip;
        } else {
            current_ip = [].concat(...Object.values(networkInterfaces()))
            .filter(details => details.family === 'IPv4' && !details.internal)
            .pop().address;
        }
        let result = await freebitcoin.redemRewardPoints();
        let history = await this.createHistory({
            type: 'redem_reward_bonus',
            result: result,
            by_ip: current_ip,
            by_proxy: this.getDataValue('use_proxy')
        });
        if (this.getDataValue('use_proxy')) {
            await history.setProxy(proxy);
        }
        if (result) {

            let result_split = result.split(':');
            while (result_split.length > 1 && result_split[0] !== 's') {
                if (result_split[0] === 'e') {
                    if (result_split[1] === SAMETYPEREWARDBONUS) {
                        console.log(freebitcoin)
                        let home_page = await freebitcoin.freebitcoin.get('?op=home');
                        let html = home_page.data;
                        let BonusEndCountdown_match = /{BonusEndCountdown\(\"free_points\",([0-9]+?)\)}/;
                        let BonusEndCountdown_found = html.match(BonusEndCountdown_match);
                        if (BonusEndCountdown_found) {
                            BonusEndCountdown = parseInt(BonusEndCountdown_found[1]);
                            await this.update({ 'last_redem_reward_bonus': Math.floor(Date.now() / 1000) - BonusEndCountdown });
                            console.log('wait', BonusEndCountdown, 'seconds to redem rewards points');
                            await sleep(BonusEndCountdown * 1000);
                        }
                    }
                }
                result = await freebitcoin.redemRewardPoints();
                result_split = result.split(':');
                history = await this.createHistory({
                    type: 'redem_reward_bonus',
                    result: result,
                    by_ip: current_ip,
                    by_proxy: this.getDataValue('use_proxy')
                });
                if (this.getDataValue('use_proxy')) {
                    history.setProxy(proxy);
                }
            }
            await this.update({ 'last_redem_reward_bonus': Math.floor(Date.now() / 1000) });
        } else {
            await this.update({ 'last_redem_reward_bonus': Math.floor(Date.now() / 1000) + 60 * 60 });
        }
    }
}
Account.prototype.redemFunTokens = async function() {
    console.log('Start redem redem Fun tokens');
    let freebitcoin = this.freebitcoin;
    while (true) {
        let last_redem_reward_bonus = this.getDataValue('last_redem_reward_bonus');
        // Redem reward points bonus
        let countdown = last_redem_reward_bonus + 24 * 60 * 60 - Math.floor(Date.now() / 1000);
        if (countdown > 0) {
            console.log('wait', countdown, 'seconds to redem redem Fun tokens');
            await sleep(countdown * 1000);
        }

        let current_ip = '';
        let proxy = null;
        if (this.getDataValue('use_proxy')) {
            proxy = await this.getProxy();
            current_ip = proxy.dataValues.proxy_ip;
        } else {
            current_ip = [].concat(...Object.values(networkInterfaces()))
            .filter(details => details.family === 'IPv4' && !details.internal)
            .pop().address;
        }
        let result = await freebitcoin.redemFunTokens();
        let history = await this.createHistory({
            type: 'redem_reward_bonus',
            result: result,
            by_ip: current_ip,
            by_proxy: this.getDataValue('use_proxy')
        });
        if (this.getDataValue('use_proxy')) {
            await history.setProxy(proxy);
        }
        if (result) {

            let result_split = result.split(':');
            while (result_split.length > 1 && result_split[0] !== 's') {
                if (result_split[0] === 'e') {
                    if (result_split[1] === SAMETYPEREWARDBONUS) {
                        console.log(freebitcoin)
                        let home_page = await freebitcoin.freebitcoin.get('?op=home');
                        let html = home_page.data;
                        let BonusEndCountdown_match = /{BonusEndCountdown\(\"fun_token\",([0-9]+?)\)}/;
                        let BonusEndCountdown_found = html.match(BonusEndCountdown_match);
                        if (BonusEndCountdown_found) {
                            BonusEndCountdown = parseInt(BonusEndCountdown_found[1]);
                            await this.update({ 'last_redem_reward_bonus': Math.floor(Date.now() / 1000) - BonusEndCountdown });
                            console.log('wait', BonusEndCountdown, 'seconds to redem Fun tokens');
                            await sleep(BonusEndCountdown * 1000);
                        }
                    }
                }
                result = await freebitcoin.redemFunTokens();
                result_split = result.split(':');
                history = await this.createHistory({
                    type: 'redem_reward_bonus',
                    result: result,
                    by_ip: current_ip,
                    by_proxy: this.getDataValue('use_proxy')
                });
                if (this.getDataValue('use_proxy')) {
                    history.setProxy(proxy);
                }
            }
            await this.update({ 'last_redem_reward_bonus': Math.floor(Date.now() / 1000) });
        } else {
            await this.update({ 'last_redem_reward_bonus': Math.floor(Date.now() / 1000) + 60 * 60 });
        }
    }
}
Account.prototype.redemFreeBtc = async function() {
    console.log('Start redem Free Btc');
    let freebitcoin = this.freebitcoin;
    while (true) {
        let last_redem_free_btc_bonus = this.getDataValue('last_redem_free_btc_bonus');
        // Redem free btc bonus
        let countdown = last_redem_free_btc_bonus + 24 * 60 * 60 - Math.floor(Date.now() / 1000);
        if (countdown > 0) {
            console.log('wait', countdown, 'seconds to redem free btc');
            await sleep(countdown * 1000);
        } else {

            let current_ip = '';
            let proxy = null;
            if (this.getDataValue('use_proxy')) {
                proxy = await this.getProxy();
                current_ip = proxy.dataValues.proxy_ip;
            } else {
                current_ip = [].concat(...Object.values(networkInterfaces()))
                .filter(details => details.family === 'IPv4' && !details.internal)
                .pop().address;
            }

            let result = await freebitcoin.redemFreeBtc();
            let history = await this.createHistory({
                type: 'redem_free_btc_bonus',
                result: result,
                by_ip: current_ip,
                by_proxy: this.getDataValue('use_proxy')
            });
            if (this.getDataValue('use_proxy')) {
                history.setProxy(proxy);
            }
            if (result) {
                let result_split = result.split(':');
                while (result_split.length > 1 && result_split[0] !== 's') {
                    if (result_split[0] === 'e') {
                        if (result_split[1] === SAMETYPEREWARDBONUS) {
                            let home_page = await freebitcoin.freebitcoin.get('?op=home');
                            let html = home_page.data;
                            let BonusEndCountdown_match = /{BonusEndCountdown\(\"fp_bonus\",([0-9]+?)\)}/;
                            let BonusEndCountdown_found = html.match(BonusEndCountdown_match);
                            if (BonusEndCountdown_found) {
                                BonusEndCountdown = parseInt(BonusEndCountdown_found[1]);
                                await this.update({ 'last_redem_reward_bonus': Math.floor(Date.now() / 1000) - BonusEndCountdown });
                                console.log('wait', BonusEndCountdown, 'seconds to redem free btc');
                                await sleep(BonusEndCountdown * 1000);
                            }
                        }
                    }
                    result = await freebitcoin.redemFreeBtc();
                    result_split = result.split(':');
                    history = await this.createHistory({
                        type: 'redem_free_btc_bonus',
                        result: result,
                        by_ip: current_ip,
                        by_proxy: this.getDataValue('use_proxy')
                    });
                    if (this.getDataValue('use_proxy')) {
                        history.setProxy(proxy);
                    }
                }
                await this.update({ 'last_redem_free_btc_bonus': Math.floor(Date.now() / 1000) });
            } else {
                await this.update({ 'last_redem_free_btc_bonus': Math.floor(Date.now() / 1000) + 60 * 60 });
            }
        }
    }
}

sequelize.authenticate().then(async() => {
    console.log('Database connected');
    await sequelize.sync({
        // force: true,
        alter: true
    });

    // let account = await Account.create({
    //     email: 'truyenhayvaicom@gmail.com',
    //     password: 'Tron421994!',
    //     fingerprint: '86791eeef4d0557ac6d88cbe05c2a350',
    //     fingerprint2: '699165186',
    //     cookie: '__cfduid=dc6a0e09fdc4e1bca458528487657f2fb1617883139; cookieconsent_dismissed=yes; csrf_token=65BlJjfS7XGe; _ga=GA1.2.1993249337.1617883146; _gid=GA1.2.684938867.1617883146; hide_push_msg=1; btc_address=1F4WAbMq7LM5JQShxDAH3kRgWQvPSUavrs; password=6d652cde93240fc809cfaf1f1db71e3c1ebd06880bceee531b1f3566e1870d46; have_account=1; login_auth=306922e727cbd56c110b4cf233fd734d97af5c7009373cf86799c21f4f1ecb2f; default_captcha=double_captchas',
    //     btc_address: '1F4WAbMq7LM5JQShxDAH3kRgWQvPSUavrs',
    //     last_roll: 1618041604,
    //     last_redem_reward_bonus: 0,
    //     last_redem_free_btc_bonus: 0,
    //     auto_captcha: 0
    // });
    // let proxy = await account.createProxy({
    //     type: 'socks5',
    //     host: '50.114.84.85',
    //     port: 45786,
    //     username: 'Sel5nescafe088',
    //     password: 'S4k3BeB'
    // });

    // console.log(await proxy.getPublicIp());

    console.log('Find all accounts.');
    let accounts = await Account.findAll({ where: { user_id: 2067378 } });
    console.log('Found', accounts.length, 'account(s).');
    for (let account of accounts) {
        await account.createInstance();
        account.freeRollPlay();
        // account.redemRewardPoints();
        // account.redemFreeBtc();
        account.redemFunTokens();
    }


}).catch(err => console.log(err));

// const FreeBitcoin = require('./freebitcoin.js');
// (async function() {
//     let cookieString = '__cfduid=dc6a0e09fdc4e1bca458528487657f2fb1617883139; cookieconsent_dismissed=yes; csrf_token=65BlJjfS7XGe; _ga=GA1.2.1993249337.1617883146; _gid=GA1.2.684938867.1617883146; hide_push_msg=1; btc_address=1F4WAbMq7LM5JQShxDAH3kRgWQvPSUavrs; password=6d652cde93240fc809cfaf1f1db71e3c1ebd06880bceee531b1f3566e1870d46; have_account=1; login_auth=306922e727cbd56c110b4cf233fd734d97af5c7009373cf86799c21f4f1ecb2f; default_captcha=double_captchas';
//     let proxy = {
//         host: '50.114.84.85',
//         port: 45786,
//         username: 'Sel5nescafe088',
//         password: 'S4k3BeB'
//     }
//     let account = new FreeBitcoin(cookieString, proxy);
//     account.autoSolveCaptcha(false);
//     await account.parseVariable();
//     await account.userStatsInitial();
//     account.setFingerprint('86791eeef4d0557ac6d88cbe05c2a350');
//     account.setFingerprint2(699165186);
//     account.freeRollPlay().then(() => {
//         // 's:4304:0.00000015:0.00000003:1617973277:0:0ff62c2b138452f4a27c026cf85ba871e17691a935f1f9064111e397c2a40002:LWNAbDnlN1oleN6S:5:9f197bc4deb748b37fbb1e50575ddea9c5be7fb5a5f6758107fe7b6d6c5e7bab:a83472d65c7343885264dec6da6f16e14bee70c663c595b1309385e15270d2df:LWNAbDnlN1oleN6S:4:8:4:2:5:0.00000000:0.0001'
//         console.log('Free roll play finished')
//         account.redemRewards().then(() => {
//             console.log('Redem rewards finished')
//         });
//     });
// });