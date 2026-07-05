// 用 JS RSA 加密来验证 Python 实现是否正确
const https = require('https');
const forge = require('node-forge');
const b64 = require('base-64');

const username = process.argv[2] || 'test';
const password = process.argv[3] || 'test';

function getLoginPage() {
    return new Promise((resolve, reject) => {
        https.get('https://xg2.nsmc.edu.cn/Sys/UserLogin.aspx', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0'
            },
            rejectUnauthorized: false
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

async function main() {
    console.log('Username:', username);
    console.log('Password:', password);

    const html = await getLoginPage();
    const m = html.match(/new RSAKeyPair\("([^"]+)",\s*"([^"]*)",\s*"([^"]+)"\)/);
    if (!m) { console.log('RSA not found'); return; }
    const [_, exp, zero, mod] = m;
    console.log('Modulus:', mod.substring(0, 40) + '...');
    console.log('Modulus length:', mod.length);

    // ====== 方法1: 使用 node-forge 标准 PKCS1 v1.5 ======
    const n = new forge.jsbn.BigInteger(mod, 16);
    const e = new forge.jsbn.BigInteger('010001', 16);
    const rsaKey = forge.pki.setRsaPublicKey(n, e);

    const raw = b64.encode(username) + '\\' + b64.encode(password);
    console.log('Raw:', raw);

    // 标准 PKCS1-v1.5 加密
    const encrypted = rsaKey.encrypt(raw, 'RSAES-PKCS1-V1_5');
    const hex_std = forge.util.bytesToHex(encrypted);
    console.log('forge hex:', hex_std.substring(0, 60) + '...');
    console.log('forge hex len:', hex_std.length);
    console.log('forge b64:', forge.util.encode64(encrypted));

    // ====== 方法2: 直接 pow_mod (与 Python 一致) ======
    const rawBytes = Buffer.from(raw, 'ascii');
    console.log('\nraw bytes hex:', rawBytes.toString('hex'));
    console.log('raw bytes length:', rawBytes.length);

    // 构建与 Python 相同的消息块
    const digit_size = 128;
    const msg_len = rawBytes.length;
    const padded_size = Math.max(8, digit_size - 3 - msg_len);

    const b = Buffer.alloc(digit_size, 0);
    for (let x = 0; x < msg_len; x++) {
        b[x] = rawBytes[msg_len - 1 - x];
    }
    b[msg_len] = 0;
    for (let x = 0; x < padded_size; x++) {
        b[msg_len + 1 + x] = Math.floor(Math.random() * 254) + 1;
    }
    b[digit_size - 2] = 2;
    b[digit_size - 1] = 0;

    console.log('padded hex:', b.toString('hex'));
    console.log('padded length:', b.length);
    console.log('padded first 4 bytes:', b.slice(0, 4).toString('hex'));
    console.log('padded last 4 bytes:', b.slice(-4).toString('hex'));

    // 转为 big-endian 整数 (Python 用 little-endian, JS 用 big-endian)
    const msgInt = new forge.jsbn.BigInteger(b.toString('hex'), 16);
    const encrypted2 = msgInt.modPow(e, n);
    const hex_pow = encrypted2.toString(16);
    console.log('\npow_mod hex:', hex_pow.substring(0, 60) + '...');
    console.log('pow_mod hex len:', hex_pow.length);

    // 现在用我们 Python 的 little-endian 方式计算
    const leInt = BigInt('0x' + b.toString('hex'));
    console.log('\nPure Python expected:');
    const n_big = BigInt('0x' + mod);
    const e_big = 65537n;
    const result = leInt ** e_big % n_big;
    const resultHex = result.toString(16);
    console.log('result hex:', resultHex.substring(0, 40) + '...');
    console.log('result hex len:', resultHex.length);
    console.log('zfilled:', resultHex.padStart(256, '0').substring(0, 40) + '...');
}

main().catch(console.error);
