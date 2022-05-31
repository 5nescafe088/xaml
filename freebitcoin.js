const axios = require('axios')
const htmlParse = require('node-html-parser');
const CryptoJS = require("crypto-js");
const socks = require('@luminati-io/socksv5');
const imageToBase64 = require('image-to-base64');
const Captcha = require("2captcha");
const solver = new Captcha.Solver("612c8a3d6113a089cb3d94d1510ef607");
const prompt = require('prompt');

class FreeBitcoin {
    constructor(cookieString, proxy, nocaptcha = false, auto_solve_captcha = true) {
        const freebitcoinConfig = {
            baseURL: 'https://freebitco.in',
            headers: {
                'cookie': cookieString,
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) coc_coc_browser/94.0.202 Chrome/88.0.4324.202 Safari/537.36'
            }
        };
        if (proxy) {
            const socksConfig = {
                proxyHost: proxy.host,
                proxyPort: proxy.port,
                auths: [socks.auth.UserPassword(proxy.username, proxy.password)]
            };
            freebitcoinConfig.proxy = false;
            freebitcoinConfig.httpsAgent = new socks.HttpsAgent(socksConfig);
        }

        this.freebitcoin = axios.create(freebitcoinConfig);
        let csrf_token_match = /csrf_token=(\w+?);/;
        this.csrfToken = cookieString.match(csrf_token_match)[1];
        this.auto_solve_captcha = auto_solve_captcha;
        this.nocaptcha = nocaptcha;
        this.countdown = 0;
        prompt.start();
    }
    autoSolveCaptcha(bool) {
        this.auto_solve_captcha = bool;
    }
    isNoCaptcha(bool) {
        this.nocaptcha = bool;
    }

    getFreeBitcoinAxios() {
        return this.freebitcoin;
    }

    async parseVariable() {
        console.log('Start parse variable');
        let home_page_response = await this.freebitcoin.get('?op=home');
        let html = home_page_response.data;

        let socket_password_match = /var socket_password = \'(\w+?)\'/;
        let socket_userid_match = /var socket_userid = \'([0-9]+?)\'/;
        this.socket_password = html.match(socket_password_match)[1];
        this.socket_userid = html.match(socket_userid_match)[1];
    }
    async userStatsInitial() {
        console.log('Start init user stats');
        let user_stats_init_configs = {
            headers: {
                // 'accept-encoding': 'gzip, deflate, br', // Sử dụng gzip sẽ trả về data dạng mã hoá
                'accept-language': 'vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5',
                'x-csrf-token': this.csrfToken,
                'referer': 'https://freebitco.in/?op=home',
                'x-requested-with': 'XMLHttpRequest',
                'content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'origin': 'https://freebitco.in',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
                'Access-Control-Allow-Origin': '*'
            },
            crossdomain: true,
            responseType: 'application/json; charset=ISO-8859-1',
            responseEncoding: 'latin1'
        }
        let uri = "/stats_new_private/?f=user_stats_initial&u=" + this.socket_userid + "&p=" + this.socket_password + "&csrf_token=" + this.csrfToken;
        await this.freebitcoin.get(uri, user_stats_init_configs);
    }


    async freeRollPlay() {
        console.log('Free roll');
        await this.getHomePage();
        if (this.countdown > 0) {
            console.log('Countdown free roll', this.countdown, 'second');
            await new Promise(r => setTimeout(r, this.countdown * 1000));
            return await this.freeRollPlay();
        }
        let free_roll_data = 'csrf_token=' + this.csrfToken;
        free_roll_data += "&op=free_play";
        free_roll_data += "&fingerprint=" + this.fingerprint;
        free_roll_data += "&client_seed=" + this.client_seed;
        free_roll_data += "&fingerprint2=" + this.fingerprint2;
        free_roll_data += "&pwc=" + this.pwc;
        free_roll_data += `&${this.token_name}=` + encodeURIComponent(this.token1);
        free_roll_data += `&${this.tcGiQefA}=` + encodeURIComponent(this.tcGiQefA_hash);

        if (!this.nocaptcha) {
            free_roll_data += "&botdetect_random=" + this.botdetect_random;
            free_roll_data += "&botdetect_response=" + await this.getCaptchasnetResponse(this.botdetect_random);
            free_roll_data += "&botdetect_random2=" + this.botdetect_random2;
            free_roll_data += "&botdetect_response2=" + await this.getCaptchasnetResponse(this.botdetect_random2);
        } else {

        }
        console.log('free_roll_data', free_roll_data);

        let free_roll_configs = {
            headers: {
                // 'accept-encoding': 'gzip, deflate, br', // Sử dụng gzip sẽ trả về data dạng mã hoá
                'accept-language': 'vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5',
                'x-csrf-token': this.csrfToken,
                'referer': 'https://freebitco.in/?op=home',
                'x-requested-with': 'XMLHttpRequest',
                'content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'origin': 'https://freebitco.in',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
                'Access-Control-Allow-Origin': '*'
            },
            crossdomain: true,
            responseType: 'application/json; charset=ISO-8859-1',
            responseEncoding: 'latin1'
        }
        try {
            let rollResult = await this.freebitcoin.post('/', free_roll_data, free_roll_configs);
            return rollResult.data;
        } catch (error) {
            console.log('Free roll Error', '' + error);
            // await new Promise(r => setTimeout(r, this.countdown * 1000));
            return await this.freeRollPlay();
        }
        // console.log(rollResult);
    }
    async getHomePage() {
        console.log('Parsing home page and get variable');
        try {
            let response = await this.freebitcoin.get('?op=home');
            let html = response.data;
            let free_roll_countdown_match = /title_countdown \(([0-9]+?)\)/;
            let free_roll_countdown_found = html.match(free_roll_countdown_match);
            if (free_roll_countdown_found) {
                this.countdown = parseInt(free_roll_countdown_found[1]);
            } else {
                let token_name_match = /var token_name = \'(\w+?)\'/;
                this.token_name = html.match(token_name_match)[1];
                let token1_match = /var token1 = \'(\w+:{1,1}\w+?)\'/;
                this.token1 = html.match(token1_match)[1];

                let tcGiQefA_match = /var tcGiQefA = \'(\w+?)\'/;
                this.tcGiQefA = html.match(tcGiQefA_match)[1];
                console.log(' this.tcGiQefA', this.tcGiQefA)
                await this.gettcGiQefA_hash();
                let document = htmlParse.parse(html);
                this.client_seed = document.querySelector("#next_client_seed").getAttribute('value');
                this.pwc = parseInt(document.querySelector("#pwc_input").getAttribute('value'));
                this.botdetect_random = await this.getCaptchasnetString();
                this.botdetect_random2 = await this.getCaptchasnetString();
            }
        } catch (error) {
            console.log('Get home page Error', '' + error);
            // await new Promise(r => setTimeout(r, this.countdown * 1000));
            await this.getHomePage();
        }
    }
    getFingerprint() {
        return this.fingerprint;
    }
    setFingerprint(fingerprint) {
        // Chạy đoạn code dưới trên trình duyệt để lấy fingerprint2
        // $.fingerprint()
        // let record_fingerprint_configs = {
        //     headers: {
        //         // 'accept-encoding': 'gzip, deflate, br', // Sử dụng gzip sẽ trả về data dạng mã hoá
        //         'accept-language': 'vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5',
        //         'x-csrf-token': this.csrfToken,
        //         'referer': 'https://freebitco.in/?op=home',
        //         'x-requested-with': 'XMLHttpRequest',
        //         'content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        //         'origin': 'https://freebitco.in',
        //         'sec-fetch-dest': 'empty',
        //         'sec-fetch-mode': 'cors',
        //         'sec-fetch-site': 'same-origin',
        //     },
        //     responseType: 'application/json; charset=ISO-8859-1',
        //     responseEncoding: 'latin1'
        // }
        // await this.freebitcoin.get("/cgi-bin/api.pl?op=record_fingerprint&fingerprint=" + fingerprint, record_fingerprint_configs);
        this.fingerprint = fingerprint;
    }
    getFingerprint2() {
        return this.fingerprint2;
    }
    setFingerprint2(fingerprint2) {
        // Chạy đoạn code dưới trên trình duyệt để lấy fingerprint2
        // let t = new Fingerprint({
        //     canvas: !0,
        //     screen_resolution: !0,
        //     ie_activex: !0
        // }).get()
        this.fingerprint2 = fingerprint2;
    }

    async gettcGiQefA_hash() {
        console.log('Geting tcGiQefA hash');
        try {
            let e = await this.freebitcoin.get("/cgi-bin/fp_check.pl?s=" + this.tcGiQefA + "&csrf_token=" + this.csrfToken);
            console.log('fp_check:', e.data);
            this.tcGiQefA_hash = CryptoJS.SHA256(e.data).toString(CryptoJS.enc.Hex);
            console.log('tcGiQefA hash:', this.tcGiQefA_hash);
            return this.tcGiQefA_hash;
        } catch (error) {
            console.log('Get tcGiQefA Error', '' + error);
            await new Promise(r => setTimeout(r, this.countdown * 1000));
            await this.gettcGiQefA_hash();
        }
    }

    getSecurimage() {
        let src = "//captchas.freebitco.in/securimage/securimage/securimage_show.php?random=" + a;
    }
    getBotdetect(a) {
        let src = "https://captchas.freebitco.in/botdetect/e/live/index.php?random=" + a;
        return src;
    }
    async getCaptchasnetString() {
        let string = await this.freebitcoin.get("/cgi-bin/api.pl?op=generate_captchasnet&f=" + this.fingerprint + "&csrf_token=" + this.csrfToken)
        console.log(string.data);
        if (string.data.length < 100) return string.data;
    }

    async getCaptchasnetResponse(a) {
        let captchaSrc = this.getBotdetect(a);
        console.log('Geting captcha text for', captchaSrc);
        if (this.auto_solve_captcha) {
            let CaptchaImageBase64 = await imageToBase64(captchaSrc);
            try {
                let captchaText = await solver.imageCaptcha(CaptchaImageBase64);
                console.log('Captcha text result for', captchaSrc, ':', captchaText.data);
                return captchaText.data;
            } catch (error) {
                console.log('' + error);
                return await this.getCaptchasnetResponse(a);
            }
        } else {
            let { captchaText } = await prompt.get('captchaText');
            console.log('Captcha text result for', captchaSrc, ':', captchaText);
            return captchaText;
        }
    }

    async getUserStats() {
        console.log('Start get user stats');
        try {
            let uri = "/stats_new_private/?f=user_stats&u=" + this.socket_userid + "&p=" + this.socket_password + "&csrf_token=" + this.csrfToken;
            let response = await this.freebitcoin.get(uri);
            let user_stats = response.data;
            return user_stats;
        } catch (error) {
            console.log('Get UserStats Error', '' + error);
            await new Promise(r => setTimeout(r, this.countdown * 1000));
            await this.getUserStats();
        }

    }

    async redemRewardPoints() {
        let user_stats = await this.getUserStats();
        let reward_points = parseInt(user_stats.user_extras.reward_points);
        let redem_reward_configs = {
            headers: {
                // 'accept-encoding': 'gzip, deflate, br', // Sử dụng gzip sẽ trả về data dạng mã hoá
                'accept-language': 'vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5',
                'x-csrf-token': this.csrfToken,
                'referer': 'https://freebitco.in/?op=home',
                'x-requested-with': 'XMLHttpRequest',
                'content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'origin': 'https://freebitco.in',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
            },
            responseType: 'application/json; charset=ISO-8859-1',
            responseEncoding: 'latin1'
        }

        // Redem reward points bonus
        let redemRewardPointsId = false;
        if (reward_points - 1200 >= 0) {
            redemRewardPointsId = 'free_points_100';
        } else if (reward_points - 600 >= 0) {
            redemRewardPointsId = 'free_points_50';
        } else if (reward_points - 300 >= 0) {
            redemRewardPointsId = 'free_points_25';
        } else if (reward_points - 120 >= 0) {
            redemRewardPointsId = 'free_points_10';
        } else if (reward_points - 12 >= 0) {
            redemRewardPointsId = 'free_points_1';
        }

        if (redemRewardPointsId) {
            try {
                let uri = "/?op=redeem_rewards&id=" + redemRewardPointsId + "&points=&csrf_token=" + this.csrfToken;
                let redem_reward_points_result = await this.freebitcoin.get(uri, redem_reward_configs);
                console.log('redem_reward_points_result', redem_reward_points_result.data);
                return redem_reward_points_result.data;
            } catch (error) {
                console.log('Redem Reward Points Error', '' + error);
                await new Promise(r => setTimeout(r, this.countdown * 1000));
                await this.redemRewardPoints();
            }

        }
        return false;
    }

    async redemFunTokens() {
        let user_stats = await this.getUserStats();
        let reward_points = parseInt(user_stats.user_extras.reward_points);
        let redem_reward_configs = {
            headers: {
                // 'accept-encoding': 'gzip, deflate, br', // Sử dụng gzip sẽ trả về data dạng mã hoá
                'accept-language': 'vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5',
                'x-csrf-token': this.csrfToken,
                'referer': 'https://freebitco.in/?op=home',
                'x-requested-with': 'XMLHttpRequest',
                'content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'origin': 'https://freebitco.in',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
            },
            responseType: 'application/json; charset=ISO-8859-1',
            responseEncoding: 'latin1'
        }

        // Redem reward points bonus
        let redemRewardPointsId = false;
        if (reward_points - 611 >= 0) {
            redemRewardPointsId = 'fun_token_1';
        }

        if (redemRewardPointsId) {
            try {
                let uri = "/?op=redeem_rewards&id=" + redemRewardPointsId + "&points=&csrf_token=" + this.csrfToken;
                let redem_reward_points_result = await this.freebitcoin.get(uri, redem_reward_configs);
                console.log('redem_reward_points_result', redem_reward_points_result.data);
                return redem_reward_points_result.data;
            } catch (error) {
                console.log('Redem Reward Points Error', '' + error);
                await new Promise(r => setTimeout(r, this.countdown * 1000));
                await this.redemRewardPoints();
            }

        }
        return false;
    }

    async redemFreeBtc() {
        let user_stats = await this.getUserStats();
        let reward_points = parseInt(user_stats.user_extras.reward_points);
        let redem_reward_configs = {
            headers: {
                // 'accept-encoding': 'gzip, deflate, br', // Sử dụng gzip sẽ trả về data dạng mã hoá
                'accept-language': 'vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5',
                'x-csrf-token': this.csrfToken,
                'referer': 'https://freebitco.in/?op=home',
                'x-requested-with': 'XMLHttpRequest',
                'content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'origin': 'https://freebitco.in',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
            },
            responseType: 'application/json; charset=ISO-8859-1',
            responseEncoding: 'latin1'
        }

        // Redem free BTC bonus
        let redemFreeBtcId = false;
        if (reward_points - 3200 >= 1200) {
            redemFreeBtcId = 'fp_bonus_1000';
        } else if (reward_points - 320 >= 1200) {
            redemFreeBtcId = 'fp_bonus_100';
        }

        if (redemFreeBtcId) {
            try {
                let uri = "/?op=redeem_rewards&id=" + redemFreeBtcId + "&points=&csrf_token=" + this.csrfToken;
                let redem_free_btc_result = await this.freebitcoin.get(uri, redem_reward_configs);
                console.log('redem_free_btc_result', redem_free_btc_result.data);
                return redem_free_btc_result.data;
            } catch (error) {
                console.log('Redem Free Btc Error', '' + error);
                await new Promise(r => setTimeout(r, this.countdown * 1000));
                await this.redemFreeBtc();
            }
        }
        return false;
    }


}

module.exports = FreeBitcoin;