'use strict';

//  ---------------------------------------------------------------------------

const Exchange = require ('./base/Exchange');
const { ExchangeError } = require ('./base/errors');

//  ---------------------------------------------------------------------------

module.exports = class xex extends Exchange {
    describe () {
        return this.deepExtend (super.describe (), {
            'id': 'xex',
            'name': 'XEX',
            'countries': [ 'JP' ],
            'comment': 'Xex API',
            'has': {
                'fetchTicker': true,
                'fetchOHLCV': true,
                'fetchOrderBook': true,
                'fetchTrades': true,
                'fetchMyTrades': true,
                'fetchOrderBooks': true,
                'fetchOpenOrders': true,
                'fetchOrder': true,
                'createOrder': true,
                'cancelOrder': true,
                'fetchBalance': true,
            },
            'timeframes': {
                '1m': '1MIN',
                '5m': '5MIN',
                '15m': '15MIN',
                '30m': '30MIN',
                '1h': '1H',
                '2h': '2H',
                '4h': '4H',
                '6h': '6H',
                '12h': '12H',
                '1d': 'D',
                '2d': '2D',
                '1w': 'W',
                'month': 'MONTH',
            },
            'urls': {
                'logo': 'https://www.crossexchange.io/images/logo_icon.png',
                'api': 'https://api.xex-dev.com',
                'www': 'http://www.xex-dev.com/cross/home',
                'doc': 'https://support.crossexchange.io/hc/en-us/categories/360001030591?flash_digest=4496738595f09128fc199486ac8f0fcee028b0ab',
            },
            'api': {
                'public': {
                    'get': [
                        'GET/v1/api/ticker',
                        'GET/v1/api/kline',
                        'GET/v1/api/depth',
                        'GET/v1/api/trades',
                    ],
                },
                'private': {
                    'get': [
                        'GET/v1/api/orderdetail',
                        'GET/v1/api/auth/wallet',
                        'GET/v1/api/mineLimit',
                    ],
                       
                    'post': [
                        'POST/v1/api/trades',
                        'POST/v1/api/orders',
                        'POST/v1/api/auth/orders',
                        'POST/v1/api/cancelOrder',
                        'POST/v1/api/placeOrder',
                        'POST/api/v1/make/leverOrder',
                        'POST/api/v1/cancle/leverOrder',
                        'POST/api/v1/leverage/change/order',
                        'POST/api/v1/leverage/charge',
                        'POST/api/v1/show/open/leverOrder',
                    ],
                },
            },
        });
    }

    async fetchMarkets () {
        let response = await this.fetch('https://web.crossexchange.io/bb/symbol/all?leverageType=0');
        let pairs = response['data']['bbPairList'];
        let ret = new Array();
        pairs.forEach(function(value){
            let symbol = value['name'];
            let parts = symbol.split("_");
            let base = parts[1];
            let quote = parts[0];
            ret.push({ 'id': symbol, 'symbol': symbol, 'base': base, 'quote': quote });
        })

        return ret;
    }

    async fetchBalance (params = {}) {
        await this.loadMarkets ();
        let response = await this.privateGetGETV1ApiAuthWallet (params);
        let result = { 'info': response };
        let free = response['data']["free"];
        let freezed = response['data']["freezed"];
        let coinTypes = Object.keys (free);
        for (let i = 0; i < coinTypes.length; i++) 
        {
            let coin_type = coinTypes[i].toUpperCase ();
            let account = this.account ();
            account['free'] = parseFloat (free[coin_type]);
            account['used'] = parseFloat (freezed[coin_type]);
            account['total'] = this.sum (account['free'], account['used']);
            result[coin_type] = account;       
        }

        return this.parseBalance (result);
    }

    async fetchOrderBook (symbol, limit = undefined, params = {}) {
        if (symbol === undefined)
            throw new ExchangeError (this.id + ' fetchOrderBook() requires a symbol argument');

        await this.loadMarkets ();
        let response = await this.publicGetGETV1ApiDepth (this.extend ({
             'pair': this.marketId (symbol),
        }, params));
        return this.parseOrderBook (response['data'], response['data']['timestamp']);
    }

    async fetchTicker (symbol, params = {}) {
        if (symbol === undefined)
            throw new ExchangeError (this.id + ' fetchTicker() requires a symbol argument');
        
await this.loadMarkets ();
        let response = await this.publicGetGETV1ApiTicker (this.extend ({
            'pair': this.marketId (symbol),
        }, params));
        
        let ticker = response['data'];
        let last = this.safeFloat (ticker, 'last');
        return {
            'symbol': symbol,
            'timestamp': ticker['timestamp'],
            'datetime': undefined,
            'high': this.safeFloat (ticker, 'high'),
            'low': this.safeFloat (ticker, 'low'),
            'bid': undefined,
            'bidVolume': undefined,
            'ask': undefined,
            'askVolume': undefined,
            'vwap': undefined,
            'open': this.safeFloat (ticker, 'open'),
            'close': last,
            'last': last,
            'previousClose': undefined,
            'change': this.safeFloat (ticker, 'dchange'),
            'percentage': this.safeFloat (ticker, 'dchangepec'),
            'average': undefined,
            'baseVolume': undefined,
            'quoteVolume': this.safeFloat (ticker, 'vol'),
            'info': ticker,
        };
    }

    async fetchOHLCV (symbol, timeframe = '1d', since = undefined, limit = undefined, params = {}) {
        if (symbol === undefined)
            throw new ExchangeError (this.id + ' fetchOHLCV() requires a symbol argument');

        await this.loadMarkets ();
        let market = this.market (symbol);
        let response = await this.publicGetGETV1ApiKline (this.extend ({
            'pair': market['id'],
            'type': this.timeframes[timeframe],
        }, params));
        let ohlcvs = response['data'];
        return this.parseOHLCVs (ohlcvs, market, timeframe, since, limit);
    }
       
       parseTrade (trade, market) {
        let side_flag = "sell"
        let price = this.asFloat(trade[1]);
        if(price > 0)
            side_flag = 'buy';
        let timestamp = trade[3];
        let fee_num = undefined;
        if(trade.length >= 7)
               fee_num = this.asFloat(trade[6]);
        return {
            'id': trade[0],
            'info': trade,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'symbol': trade[5],
            'order': undefined,
            'type': trade[4],
            'side': side_flag,
            'price': price,
            'amount': this.asFloat(trade[2]),
               'fee': fee_num,
        };
    }

    async fetchTrades (symbol, since = undefined, limit = undefined, params = {}) {
        if (symbol === undefined)
            throw new ExchangeError (this.id + ' fetchTrades() requires a symbol argument');

        await this.loadMarkets ();
        let market = this.market (symbol);
        let response = await this.publicGetGETV1ApiTrades (this.extend ({
            'pair': market['id'],
        }, params));
        let trades = response['data']
        let newTrades = new Array();
        for(let i = 0; i < trades.length; i++)
        {
               let oneTrade = new Array();
               for(let k = 0; k < trades[i].length; k++)
               {
                oneTrade.push(trades[i][k]);
               }
               oneTrade.push(symbol);
               newTrades.push(oneTrade)
        }
        return this.parseTrades (newTrades, market, since, limit);
    }
       
       async fetchMyTrades (symbol = undefined, since = undefined, limit = undefined, params = {}) {
        if (symbol === undefined)
            throw new ExchangeError (this.id + ' fetchMyTrades() requires a symbol argument');

        await this.loadMarkets ();
        let response = await this.privatePostPOSTV1ApiTrades (params);
        let trades = response['data']
        let newTrades = new Array();
        for(let i = 0; i < trades.length; i++)
        {
               let oneTrade = new Array();
               oneTrade.push(trades[i][0]);       //       0: trade id
               oneTrade.push(trades[i][3]);       //        1: price
               oneTrade.push(trades[i][4]);       //       2: amount
               oneTrade.push(trades[i][2]);       //       3: time
               oneTrade.push(trades[i][6]);       //        4: type
               oneTrade.push(trades[i][1]);       //       5: pair
               oneTrade.push(trades[i][8]);       //       6: fee
               newTrades.push(oneTrade)
        }
        
        return this.parseTrades (newTrades, undefined, since, limit);
    }
       
       parseOrderStatus (status) {
        let statuses = {
            '1': 'Start',
            '2': 'Partially Executed', // partially filled
            '3': 'Executed',
            '4': 'Cancelled',
        };
        if (status in statuses) {
            return statuses[status];
        }
        return status;
    }

       async fetchOrder (id, symbol = undefined, params = {}) {
        if (id === undefined)
            throw new ExchangeError (this.id + ' fetchOrder() requires a id argument');

        await this.loadMarkets ();
        let request = {
            'order_id': id,
        };
        let response = await this.privateGetGETV1ApiOrderdetail (this.extend (request, params));
        let order = response['data'];
        let timestamp = order[2];
        let status = this.parseOrderStatus (order[9]);
        let total = this.asFloat (order[4]);
        let comleted = this.asFloat (order[3]);
        let remain = total - comleted;
        let sidex = 'sell'
        let price = this.asFloat(order[5]);
        if(price > 0)
            sidex = 'buy';
        let result = {
            'info': order,
            'id': id,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'lastTradeTimestamp': undefined,
            'symbol': order[1],
            'type': order[7],
            'side': sidex,
            'price': price,
            'cost': undefined,
            'average': order[6],
            'amount': total,
            'filled': comleted,
            'remaining': remain,
            'status': status,
            'fee': undefined,
               'stop_price': order[8],
        };
        return result;
    }
       
       async fetchOrderBooks (symbols = undefined, params = {}) {
        await this.loadMarkets ();
        let response = await this.privatePostPOSTV1ApiOrders (params);
        if ('data' in response) 
        {
            return this.parseOrders (response['data'], undefined, undefined, undefined);
        }
        return [];
    }
       
       parseOrder (order, market = undefined) {
        let id = order[0];
        let timestamp = order[2];
        let symbol = order[1];
        let filled = this.asFloat(order[3]);
        let amount = this.asFloat(order[4]);
        let side = 'sell'
        let price = this.asFloat(order[5]);
        if(price > 0)
            side = 'buy';
        let remaining = amount - filled;
        let tradePrice = this.asFloat(order[6]);
        let cost = filled * tradePrice;
        let type = order[7];
        let stopPrice = this.asFloat(order[8])
        let status = this.parseOrderStatus (order[9]);
        
        let result = {
            'info': order,
            'id': id,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'lastTradeTimestamp': undefined,
            'symbol': symbol,
            'type': type,
            'side': side,
            'price': price,
            'cost': cost,
            'average': undefined,
            'amount': amount,
            'filled': filled,
            'remaining': remaining,
            'status': status,
            'fee': undefined,
               'stop_price':stopPrice,
        };
        return result;
    }
       
       async fetchOpenOrders (symbol = undefined, since = undefined, limit = undefined, params = {}) {
        await this.loadMarkets ();
        let response = await this.privatePostPOSTV1ApiAuthOrders ();
        if ('data' in response) 
        {
            return this.parseOrders (response['data'], undefined, since, limit);
        }
        return [];
    }
       
    
    async createOrder (symbol, type, side, amount, price = undefined, params = {}) {
        await this.loadMarkets ();
        let order = {
            'isbid': side,
            'order_type': type,
            'pair': this.marketId (symbol),
            'amount': amount,
        };
        if (type === 'STOP-LIMIT')
            order['stop_price'] = price;
        else
               order['stop_price'] = 0;
        let result = await this.privatePostPOSTV1ApiPlaceOrder (this.extend (order, params));
        return {
            'info': result,
            'id': result['data']['orderId'],
        };
    }

    async cancelOrder (id, symbol = undefined, params = {}) {
        if (symbol === undefined)
            throw new ExchangeError (this.id + ' cancelOrder() requires a symbol argument');
        
        await this.loadMarkets ();
        return await this.privatePostPOSTV1ApiCancelOrder(this.extend ({
            'order_id': id,
               'pair': this.marketId (symbol),
        }, params));
    }
       
        nonce () {
        return this.milliseconds ();
    }

    // 查询打开的杠杆订单
    async showLeverOrders (page, pagesize, params = {}) {
        let order = {
            'page': page,
            'pageSize': pagesize,
        };
        let result = await this.privatePostPOSTApiV1ShowOpenLeverOrder (this.extend (order, params));
        return {
            'info': result,
            'orders': result['data']['orders'],
        };
    }

    // 创建杠杆订单
    async createLeverOrder (symbol, side, amount, price, rate, params = {}) {
        await this.loadMarkets ();
        let order = {
            'isBid': side,
            'price': price,
            'pair': this.marketId (symbol),
            'number': amount,
            'rate': rate,
        };
        let result = await this.privatePostPOSTApiV1MakeLeverOrder (this.extend (order, params));
        return {
            'info': result,
            'orderId': result['data']['orderId'],
        };
    }

    // 修改杠杆订单
    async changeLeverOrder (id, params = {}) {
        let order = {
            'orderId': id,
        };
        return await this.privatePostPOSTApiV1LeverageChangeOrder (this.extend (order, params));
    }

    // 充提保证金
    async leverageCharge (id, number, params = {}) {
        let order = {
            'orderId': id,
            'number': number,
        };
        return await this.privatePostPOSTApiV1LeverageCharge (this.extend (order, params));
    }

    // 取消杠杆订单
    async cancelLeverOrder (id, params = {}) {        
        return await this.privatePostPOSTApiV1CancleLeverOrder(this.extend ({
            'orderId': id,
        }, params));
    }
       
        nonce () {
        return this.milliseconds ();
    }

    sign (path, api = 'public', method = 'GET', params = {}, headers = undefined, body = undefined) {
        if (this.id === 'cryptocapital')
            throw new ExchangeError (this.id + ' is an abstract base API for xex');
        let url = this.urls['api'] + '/' + path;
        if (api === 'public') {
            if (Object.keys (params).length)
                url += '?' + this.urlencode (params);
        } else {
            let unsigned = params["unsigned"];
            delete params["unsigned"];
            this.checkRequiredCredentials ();
               let time = this.nonce();
               let query = this.keysort (this.extend ({
                'api_key': this.apiKey,
                'auth_nonce': time,
            }, params));
                       
               let str = ''
               Object.keys(query).forEach(function(key)
               {
                str += query[key]
               });
               
               let signed = this.hash (this.encode(str + this.secret));
               if(method === 'GET')
               {
                signed = this.hash (this.encode(this.apiKey + time + this.secret));
               }
               query = this.extend(query, unsigned);
               let query_str = this.urlencode(query);
            url += '?' + query_str + '&auth_sign=' + signed;
            headers = { 'Content-Type': 'application/json' };
        }
        return { 'url': url, 'method': method, 'body': body, 'headers': headers };
    }

    async request (path, api = 'public', method = 'GET', params = {}, headers = undefined, body = undefined) {
        let response = await this.fetch2 (path, api, method, params, headers, body);
        if ('msg' in response) {
            let errors = response['msg'];
            throw new ExchangeError (this.id + ' ' + errors);
        }
        return response;
    }
};
